import base64
import datetime
import hashlib
import hmac
import json
import os
import time
from urllib.parse import parse_qs
from typing import Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from postgrest.exceptions import APIError
from supabase import Client, create_client
try:
    from backend.models import Alert, AlertCreate, AlertUpdate, Farmer, FarmerCreate, FarmerUpdate, User, UserCreate, UserUpdate
    from backend.sms_gateway import SMSGatewayClient
except ModuleNotFoundError:
    from models import Alert, AlertCreate, AlertUpdate, Farmer, FarmerCreate, FarmerUpdate, User, UserCreate, UserUpdate  # type: ignore[no-redef]
    from sms_gateway import SMSGatewayClient  # type: ignore[no-redef]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def get_env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or value == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def parse_cors_origins() -> list[str]:
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    return [origin.strip() for origin in origins.split(",") if origin.strip()]


def create_supabase_client() -> Client:
    return create_client(
        get_env("SUPABASE_URL"),
        get_env("SUPABASE_SERVICE_ROLE_KEY"),
    )


app = FastAPI(title="Umoja API", version="1.0.0")
supabase = create_supabase_client()
sms_client = SMSGatewayClient(
    base_url=os.getenv("SMS_GATEWAY_BASE_URL", ""),
    api_key=os.getenv("SMS_GATEWAY_API_KEY", ""),
    device_ids=os.getenv("SMS_GATEWAY_DEVICE_IDS", ""),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def raise_database_error(error: Exception) -> None:
    if isinstance(error, APIError):
        message = error.message or "Supabase request failed"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message) from error

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Unexpected database error: {error}",
    ) from error


def get_single_record(table: str, record_id: int) -> dict[str, Any]:
    try:
        response = supabase.table(table).select("*").eq("id", record_id).limit(1).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{table[:-1].title()} not found")

    return response.data[0]


def count_active_farmers(district: str) -> int:
    try:
        response = (
            supabase.table("farmers")
            .select("id", count="exact")
            .eq("district", district)
            .eq("active", True)
            .execute()
        )
    except Exception as error:
        raise_database_error(error)

    return response.count or 0


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return "pbkdf2_sha256$100000${}${}".format(
        base64.b64encode(salt).decode("utf-8"),
        base64.b64encode(derived_key).decode("utf-8"),
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, rounds_str, salt_b64, expected_b64 = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_str)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(expected_b64)
    except Exception:  # noqa: BLE001
        return False

    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return hmac.compare_digest(derived, expected)


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def get_auth_secret() -> str:
    return os.getenv("AUTH_SECRET") or get_env("SUPABASE_SERVICE_ROLE_KEY")


def create_access_token(user: dict[str, Any], ttl_seconds: int = 60 * 60 * 8) -> str:
    payload = {
        "sub": user["username"],
        "role": user["role"],
        "exp": int(time.time()) + ttl_seconds,
    }
    payload_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = b64url_encode(payload_json)
    signature = hmac.new(get_auth_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return f"{payload_b64}.{b64url_encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload_b64, signature_b64 = token.split(".", 1)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from error

    expected = hmac.new(get_auth_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    signature = b64url_decode(signature_b64)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    try:
        payload = json.loads(b64url_decode(payload_b64).decode("utf-8"))
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from error

    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    return payload


def require_auth(authorization: Optional[str]) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    try:
        response = supabase.table("users").select("id,username,role,created_at").eq("username", username).limit(1).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")

    return response.data[0]


def sanitize_user(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record["id"],
        "username": record["username"],
        "role": record["role"],
        "created_at": record.get("created_at"),
    }


class ReportCreate(BaseModel):
    phone: str
    district: str
    crop: str
    symptom: str
    severity: str = "Low"
    date: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "reviewer"


def format_report(record: dict[str, Any]) -> dict[str, Any]:
    status_value = str(record.get("status", "pending")).lower()
    ui_status = {
        "new": "Pending",
        "classified": "Pending",
        "approved": "Verified",
        "rejected": "Rejected",
        "resolved": "Verified",
    }.get(status_value, status_value.title())

    district_value = str(record.get("district") or "").strip()
    if district_value.lower() in {"", "unknown"}:
        inferred_district = infer_district_from_phone(str(record.get("phone") or ""))
        if inferred_district != "unknown":
            district_value = inferred_district

    return {
        "id": record.get("id"),
        "phone": record.get("phone", ""),
        "district": district_value,
        "crop": record.get("crop", ""),
        "symptom": record.get("symptom", ""),
        "severity": record.get("severity", "Low"),
        "date": record.get("date") or record.get("report_date"),
        "status": ui_status,
        "created_at": record.get("created_at"),
    }


@app.get("/")
def read_root() -> dict[str, Any]:
    return {
        "message": "Umoja backend is running",
        "resources": ["farmers", "alerts", "users", "reports"],
        "reports_enabled": True,
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register")
def register_user(payload: RegisterRequest) -> dict[str, Any]:
    allowed_roles = {"admin", "reviewer", "district_officer"}
    role = payload.role.strip().lower()
    if role not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    user_payload = {
        "username": payload.username,
        "password_hash": hash_password(payload.password),
        "role": role,
    }

    try:
        response = supabase.table("users").insert(user_payload).execute()
    except Exception as error:
        raise_database_error(error)

    created_user = response.data[0]
    token = create_access_token(created_user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": sanitize_user(created_user),
    }


@app.post("/auth/login")
def login_user(payload: LoginRequest) -> dict[str, Any]:
    try:
        response = supabase.table("users").select("*").eq("username", payload.username).limit(1).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    user = response.data[0]
    if not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": sanitize_user(user),
    }


@app.get("/auth/me")
def get_me(authorization: Optional[str] = Header(default=None, alias="Authorization")) -> dict[str, Any]:
    user = require_auth(authorization)
    return sanitize_user(user)


# ---------------------------------------------------------------------------
# Inbound SMS  (SMS Gateway App -> POST /sms/inbound)
# ---------------------------------------------------------------------------

class InboundSMS(BaseModel):
    """Payload sent by the SMS Gateway App webhook."""
    phone: str
    message: str
    received_at: Optional[str] = None


def infer_district_from_phone(phone: str) -> str:
    normalized_phone = str(phone or "").strip().replace(" ", "").replace("-", "")
    if normalized_phone.startswith("+32") or normalized_phone.startswith("0032"):
        return "Belgium"
    return "unknown"


def persist_inbound_sms(phone: str, message: str, received_at: Optional[str]) -> None:
    inferred_district = infer_district_from_phone(phone)

    # Ensure farmer exists (insert only if phone not found)
    try:
        farmer_lookup = (
            supabase.table("farmers")
            .select("id,district")
            .eq("phone", phone)
            .limit(1)
            .execute()
        )
        if not farmer_lookup.data:
            supabase.table("farmers").insert(
                {"phone": phone, "district": inferred_district, "active": True}
            ).execute()
        else:
            existing_farmer = farmer_lookup.data[0]
            current_district = str(existing_farmer.get("district") or "").strip().lower()
            if current_district in {"", "unknown"} and inferred_district != "unknown":
                supabase.table("farmers").update({"district": inferred_district}).eq("id", existing_farmer["id"]).execute()
    except Exception as error:
        raise_database_error(error)

    # Save raw SMS as a pending report — structured fields filled in by staff later
    record = {
        "phone": phone,
        "raw_message": message,
        "symptom": message,
        "district": inferred_district,
        "crop": "",
        "severity": "low",
        "report_date": received_at or datetime.date.today().isoformat(),
    }
    try:
        supabase.table("reports").insert(record).execute()
    except Exception as error:
        raise_database_error(error)


def ensure_farmer_for_report(phone: str, district: str) -> None:
    normalized_phone = (phone or "").strip()
    normalized_district = (district or "").strip()

    if not normalized_phone:
        return

    if len(normalized_district) < 2:
        normalized_district = "unknown"

    try:
        farmer_lookup = (
            supabase.table("farmers")
            .select("id,district,active")
            .eq("phone", normalized_phone)
            .limit(1)
            .execute()
        )
    except Exception as error:
        raise_database_error(error)

    if not farmer_lookup.data:
        try:
            supabase.table("farmers").insert(
                {"phone": normalized_phone, "district": normalized_district, "active": True}
            ).execute()
        except Exception as error:
            raise_database_error(error)
        return

    existing = farmer_lookup.data[0]
    update_payload: dict[str, Any] = {}
    if not existing.get("active"):
        update_payload["active"] = True
    if existing.get("district") in {None, "", "unknown"} and normalized_district != "unknown":
        update_payload["district"] = normalized_district

    if update_payload:
        try:
            supabase.table("farmers").update(update_payload).eq("id", existing["id"]).execute()
        except Exception as error:
            raise_database_error(error)


def verify_sms_gateway_signature(messages_raw: str, signature: str) -> bool:
    digest = hmac.new(
        os.getenv("SMS_GATEWAY_API_KEY", "").encode("utf-8"),
        messages_raw.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature)


@app.post("/sms/inbound", status_code=status.HTTP_200_OK)
async def receive_inbound_sms(
    request: Request,
    x_sg_signature: str | None = Header(default=None, alias="X-SG-SIGNATURE"),
) -> dict[str, Any]:
    """
    Webhook called by the SMS Gateway App for every incoming SMS.
    Supports two formats:
    1) Real SMS Gateway webhook (form field `messages` + `X-SG-SIGNATURE`)
    2) Direct JSON testing payload { phone, message, received_at }
    """
    try:
        raw_body = (await request.body()).decode("utf-8")
    except Exception as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid request body: {error}") from error

    form_params = parse_qs(raw_body, keep_blank_values=True)
    messages_raw = form_params.get("messages", [None])[0]

    if messages_raw is not None:
        if not x_sg_signature:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing X-SG-SIGNATURE header")

        if not verify_sms_gateway_signature(messages_raw, x_sg_signature):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signature mismatch")

        try:
            messages = json.loads(messages_raw)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid messages JSON: {error}") from error

        if not isinstance(messages, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="messages must be a JSON array")

        processed = 0
        for message in messages:
            if not isinstance(message, dict):
                continue
            phone = message.get("number")
            text = message.get("message")
            received_at = message.get("sentDate") or message.get("deliveredDate")
            if phone and text:
                persist_inbound_sms(str(phone), str(text), str(received_at) if received_at else None)
                processed += 1

        return {"received": True, "count": processed}

    # Fallback for local/dev testing with JSON payload
    try:
        json_payload = json.loads(raw_body or "{}")
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported payload. Send form field 'messages' or JSON {phone,message}",
        ) from error

    try:
        payload = InboundSMS(**json_payload)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid JSON payload: {error}",
        ) from error

    persist_inbound_sms(payload.phone, payload.message, payload.received_at)

    return {"received": True, "count": 1}


@app.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(report: ReportCreate) -> dict[str, Any]:
    payload = report.model_dump()
    report_date = payload.pop("date", None) or datetime.date.today().isoformat()
    symptom_text = payload.get("symptom", "")
    severity_value = str(payload.get("severity", "low")).strip().lower()
    if severity_value not in {"low", "medium", "high"}:
        severity_value = "low"

    payload["raw_message"] = symptom_text
    payload["severity"] = severity_value
    payload["report_date"] = report_date
    payload["status"] = "new"

    ensure_farmer_for_report(str(payload.get("phone", "")), str(payload.get("district", "")))

    try:
        response = supabase.table("reports").insert(payload).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create report")

    return format_report(response.data[0])


@app.get("/reports")
def get_reports(authorization: Optional[str] = Header(default=None, alias="Authorization")) -> list[dict[str, Any]]:
    require_auth(authorization)
    try:
        response = supabase.table("reports").select("*").order("id", desc=True).execute()
    except Exception as error:
        raise_database_error(error)

    return [format_report(record) for record in (response.data or [])]


@app.put("/reports/{report_id}/verify")
def verify_report(report_id: int, authorization: Optional[str] = Header(default=None, alias="Authorization")) -> dict[str, Any]:
    require_auth(authorization)
    get_single_record("reports", report_id)

    try:
        response = supabase.table("reports").update({"status": "approved"}).eq("id", report_id).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return format_report(response.data[0])


@app.put("/reports/{report_id}/reject")
def reject_report(report_id: int, authorization: Optional[str] = Header(default=None, alias="Authorization")) -> dict[str, Any]:
    require_auth(authorization)
    get_single_record("reports", report_id)

    try:
        response = supabase.table("reports").update({"status": "rejected"}).eq("id", report_id).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return format_report(response.data[0])


# ---------------------------------------------------------------------------
# Send alert via SMS Gateway  (Frontend -> POST /alerts/send)
# ---------------------------------------------------------------------------

@app.post("/alerts/send", response_model=Alert, status_code=status.HTTP_201_CREATED)
def send_alert(alert: AlertCreate, authorization: Optional[str] = Header(default=None, alias="Authorization")) -> dict[str, Any]:
    """
    Creates an alert record, sends an SMS to every active farmer in the
    district via the SMS Gateway API, then updates the alert status and
    target_count in Supabase.
    """
    current_user = require_auth(authorization)
    active_farmers: list[dict[str, Any]] = []
    try:
        response = (
            supabase.table("farmers")
            .select("phone")
            .eq("district", alert.district)
            .eq("active", True)
            .execute()
        )
        active_farmers = response.data or []
    except Exception as error:
        raise_database_error(error)

    phone_numbers = [f["phone"] for f in active_farmers]

    # Send SMS (best-effort: we record the alert even if gateway is down)
    sms_success = False
    if phone_numbers and sms_client.configured:
        try:
            send_results = sms_client.send_bulk(phone_numbers, alert.message)
            sms_success = any("error" not in result for result in send_results)
        except Exception:  # noqa: BLE001
            sms_success = False

    final_status = "sent" if sms_success else "draft"
    payload = alert.model_dump(mode="json")
    payload["target_count"] = len(phone_numbers)
    payload["status"] = final_status
    payload["created_by"] = current_user["username"]

    try:
        db_response = supabase.table("alerts").insert(payload).execute()
    except Exception as error:
        raise_database_error(error)

    return db_response.data[0]


@app.get("/farmers", response_model=list[Farmer])
def get_farmers() -> list[dict[str, Any]]:
    try:
        response = supabase.table("farmers").select("*").order("id", desc=True).execute()
        return response.data or []
    except Exception as error:
        raise_database_error(error)


@app.get("/farmers/{farmer_id}", response_model=Farmer)
def get_farmer(farmer_id: int) -> dict[str, Any]:
    return get_single_record("farmers", farmer_id)


@app.post("/farmers", response_model=Farmer, status_code=status.HTTP_201_CREATED)
def create_farmer(farmer: FarmerCreate) -> dict[str, Any]:
    try:
        response = supabase.table("farmers").insert(farmer.model_dump()).execute()
    except Exception as error:
        raise_database_error(error)

    return response.data[0]


@app.patch("/farmers/{farmer_id}", response_model=Farmer)
def update_farmer(farmer_id: int, farmer: FarmerUpdate) -> dict[str, Any]:
    payload = farmer.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No farmer fields provided")

    get_single_record("farmers", farmer_id)

    try:
        response = supabase.table("farmers").update(payload).eq("id", farmer_id).execute()
    except Exception as error:
        raise_database_error(error)

    return response.data[0]


@app.delete("/farmers/{farmer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_farmer(farmer_id: int) -> Response:
    get_single_record("farmers", farmer_id)

    try:
        supabase.table("farmers").delete().eq("id", farmer_id).execute()
    except Exception as error:
        raise_database_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/alerts", response_model=list[Alert])
def get_alerts(authorization: Optional[str] = Header(default=None, alias="Authorization")) -> list[dict[str, Any]]:
    require_auth(authorization)
    try:
        response = supabase.table("alerts").select("*").order("alert_date", desc=True).execute()
        return response.data or []
    except Exception as error:
        raise_database_error(error)


@app.get("/alerts/public", response_model=list[Alert])
def get_public_alerts() -> list[dict[str, Any]]:
    try:
        response = supabase.table("alerts").select("*").order("alert_date", desc=True).execute()
        return response.data or []
    except Exception as error:
        raise_database_error(error)


@app.get("/alerts/{alert_id}", response_model=Alert)
def get_alert(alert_id: int) -> dict[str, Any]:
    return get_single_record("alerts", alert_id)


@app.post("/alerts", response_model=Alert, status_code=status.HTTP_201_CREATED)
def create_alert(alert: AlertCreate) -> dict[str, Any]:
    payload = alert.model_dump(mode="json")
    payload["target_count"] = count_active_farmers(payload["district"])

    try:
        response = supabase.table("alerts").insert(payload).execute()
    except Exception as error:
        raise_database_error(error)

    return response.data[0]


@app.patch("/alerts/{alert_id}", response_model=Alert)
def update_alert(alert_id: int, alert: AlertUpdate) -> dict[str, Any]:
    payload = alert.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No alert fields provided")

    current_alert = get_single_record("alerts", alert_id)
    district = payload.get("district", current_alert["district"])
    if "target_count" not in payload:
        payload["target_count"] = count_active_farmers(district)

    try:
        response = supabase.table("alerts").update(payload).eq("id", alert_id).execute()
    except Exception as error:
        raise_database_error(error)

    return response.data[0]


@app.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(alert_id: int) -> Response:
    get_single_record("alerts", alert_id)

    try:
        supabase.table("alerts").delete().eq("id", alert_id).execute()
    except Exception as error:
        raise_database_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/users", response_model=list[User])
def get_users() -> list[dict[str, Any]]:
    try:
        response = supabase.table("users").select("id,username,role,created_at").order("id", desc=True).execute()
        return [sanitize_user(record) for record in (response.data or [])]
    except Exception as error:
        raise_database_error(error)


@app.get("/users/{user_id}", response_model=User)
def get_user(user_id: int) -> dict[str, Any]:
    record = get_single_record("users", user_id)
    return sanitize_user(record)


@app.post("/users", response_model=User, status_code=status.HTTP_201_CREATED)
def create_user(user: UserCreate) -> dict[str, Any]:
    payload = {
        "username": user.username,
        "password_hash": hash_password(user.password),
        "role": user.role,
    }

    try:
        response = supabase.table("users").insert(payload).execute()
    except Exception as error:
        raise_database_error(error)

    return sanitize_user(response.data[0])


@app.patch("/users/{user_id}", response_model=User)
def update_user(user_id: int, user: UserUpdate) -> dict[str, Any]:
    payload = user.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No user fields provided")

    get_single_record("users", user_id)

    if "password" in payload:
        payload["password_hash"] = hash_password(payload.pop("password"))

    try:
        response = supabase.table("users").update(payload).eq("id", user_id).execute()
    except Exception as error:
        raise_database_error(error)

    return sanitize_user(response.data[0])


@app.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int) -> Response:
    get_single_record("users", user_id)

    try:
        supabase.table("users").delete().eq("id", user_id).execute()
    except Exception as error:
        raise_database_error(error)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
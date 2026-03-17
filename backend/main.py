import base64
import datetime
import hashlib
import os
from typing import Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response, status
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


def format_report(record: dict[str, Any]) -> dict[str, Any]:
    status_value = str(record.get("status", "pending")).lower()
    ui_status = {
        "new": "Pending",
        "classified": "Pending",
        "approved": "Verified",
        "rejected": "Rejected",
        "resolved": "Verified",
    }.get(status_value, status_value.title())

    return {
        "id": record.get("id"),
        "phone": record.get("phone", ""),
        "district": record.get("district", ""),
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


# ---------------------------------------------------------------------------
# Inbound SMS  (SMS Gateway App -> POST /sms/inbound)
# ---------------------------------------------------------------------------

class InboundSMS(BaseModel):
    """Payload sent by the SMS Gateway App webhook."""
    phone: str
    message: str
    received_at: Optional[str] = None


@app.post("/sms/inbound", status_code=status.HTTP_200_OK)
def receive_inbound_sms(payload: InboundSMS) -> dict[str, Any]:
    """
    Webhook called by the SMS Gateway App for every incoming SMS.
        - Upserts the farmer (creates if unknown, otherwise leaves existing record).
        - Saves the raw SMS as a pending report in the `reports` table.
            Staff manually fills in crop/district/severity during review.
    """
    # Ensure farmer exists (insert only if phone not found)
    try:
        farmer_lookup = (
            supabase.table("farmers")
            .select("id")
            .eq("phone", payload.phone)
            .limit(1)
            .execute()
        )
        if not farmer_lookup.data:
            supabase.table("farmers").insert(
                {"phone": payload.phone, "district": "unknown", "active": True}
            ).execute()
    except Exception as error:
        raise_database_error(error)

    # Save raw SMS as a pending report — structured fields filled in by staff later
    record = {
        "phone": payload.phone,
        "raw_message": payload.message,
        "symptom": payload.message,   # raw SMS text until staff parses it
        "district": "",
        "crop": "",
        "severity": None,
        "report_date": payload.received_at or datetime.date.today().isoformat(),
        "status": "new",
    }
    try:
        supabase.table("reports").insert(record).execute()
    except Exception as error:
        raise_database_error(error)

    return {"received": True}


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

    try:
        response = supabase.table("reports").insert(payload).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create report")

    return format_report(response.data[0])


@app.get("/reports")
def get_reports() -> list[dict[str, Any]]:
    try:
        response = supabase.table("reports").select("*").order("id", desc=True).execute()
    except Exception as error:
        raise_database_error(error)

    return [format_report(record) for record in (response.data or [])]


@app.put("/reports/{report_id}/verify")
def verify_report(report_id: int) -> dict[str, Any]:
    get_single_record("reports", report_id)

    try:
        response = supabase.table("reports").update({"status": "approved"}).eq("id", report_id).execute()
    except Exception as error:
        raise_database_error(error)

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return format_report(response.data[0])


@app.put("/reports/{report_id}/reject")
def reject_report(report_id: int) -> dict[str, Any]:
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
def send_alert(alert: AlertCreate) -> dict[str, Any]:
    """
    Creates an alert record, sends an SMS to every active farmer in the
    district via the SMS Gateway API, then updates the alert status and
    target_count in Supabase.
    """
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
            sms_client.send_bulk(phone_numbers, alert.message)
            sms_success = True
        except Exception:  # noqa: BLE001
            sms_success = False

    final_status = "sent" if sms_success else "failed"
    payload = alert.model_dump()
    payload["target_count"] = len(phone_numbers)
    payload["status"] = final_status

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
def get_alerts() -> list[dict[str, Any]]:
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
    payload = alert.model_dump()
    payload["target_count"] = count_active_farmers(payload["district"])

    try:
        response = supabase.table("alerts").insert(payload).execute()
    except Exception as error:
        raise_database_error(error)

    return response.data[0]


@app.patch("/alerts/{alert_id}", response_model=Alert)
def update_alert(alert_id: int, alert: AlertUpdate) -> dict[str, Any]:
    payload = alert.model_dump(exclude_none=True)
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
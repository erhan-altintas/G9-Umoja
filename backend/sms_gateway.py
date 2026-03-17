"""
HTTP client for the SMS-Gateway-App open-source SMS gateway.
"""
from __future__ import annotations

import logging
from json import JSONDecodeError
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class SMSGatewayClient:
    """Thin wrapper around sms-gateway.app API."""

    def __init__(self, base_url: str, api_key: str, device_ids: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.device_ids = device_ids

    @property
    def configured(self) -> bool:
        """Returns True only when base_url, api_key and device IDs are set."""
        return bool(self.base_url and self.api_key and self.device_ids)

    def _send_url(self) -> str:
        if self.base_url.endswith("/api.php"):
            return self.base_url.replace("/api.php", "/services/send.php")
        if self.base_url.endswith("/api/v1"):
            return self.base_url.replace("/api/v1", "/services/send.php")
        if self.base_url.endswith("/services"):
            return f"{self.base_url}/send.php"
        if self.base_url.endswith("/services/send.php"):
            return self.base_url
        return f"{self.base_url}/services/send.php"

    @staticmethod
    def _parse_response(response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                return payload
            return {"data": payload}
        except JSONDecodeError:
            return {"raw": response.text}

    def send_single(self, phone: str, message: str) -> dict[str, Any]:
        """Send an SMS to a single phone number via sms-gateway.app."""
        if not self.configured:
            raise RuntimeError("SMS Gateway is not configured (missing base_url, api_key, or device_ids)")

        params = {
            "key": self.api_key,
            "number": phone,
            "message": message,
            "devices": self.device_ids,
            "type": "sms",
            "prioritize": "0",
        }

        with httpx.Client(timeout=15) as client:
            response = client.get(self._send_url(), params=params)
            response.raise_for_status()
            return self._parse_response(response)

    def send_bulk(self, phone_numbers: list[str], message: str) -> list[dict[str, Any]]:
        """
        Send the same message to multiple phone numbers.
        Uses the gateway's bulk endpoint if available, otherwise fans out individually.
        Returns a list of per-recipient gateway responses.
        """
        if not self.configured:
            raise RuntimeError("SMS Gateway is not configured (missing base_url, api_key, or device_ids)")

        results: list[dict[str, Any]] = []
        for phone in phone_numbers:
            try:
                response = self.send_single(phone, message)
                results.append({"phone": phone, "result": response})
            except Exception as error:  # noqa: BLE001
                logger.error("Failed to send SMS to %s: %s", phone, error)
                results.append({"phone": phone, "error": str(error)})

        return results

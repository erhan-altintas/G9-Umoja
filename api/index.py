from backend.main import app as fastapi_app


async def app(scope, receive, send):
	if scope["type"] == "http":
		path = scope.get("path", "")
		if path == "/api":
			path = "/"
		elif path.startswith("/api/"):
			path = path[4:]

		if path != scope.get("path"):
			updated_scope = {**scope, "path": path, "root_path": "/api"}
			raw_path = scope.get("raw_path")
			if raw_path == b"/api":
				updated_scope["raw_path"] = b"/"
			elif isinstance(raw_path, bytes) and raw_path.startswith(b"/api/"):
				updated_scope["raw_path"] = raw_path[4:]
			scope = updated_scope

	await fastapi_app(scope, receive, send)
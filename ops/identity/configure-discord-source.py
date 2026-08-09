"""Create or update Northline's Authentik Discord account-linking source.

The Discord client secret is read from stdin and is never written to disk.
Authentik API credentials are read from the existing Northline environment.
"""

import json
import os
import sys
import urllib.error
import urllib.request


base = os.environ["NORTHLINE_AUTHENTIK_API_URL"].rstrip("/")
token = os.environ["NORTHLINE_AUTHENTIK_API_TOKEN"]
secret = sys.stdin.read().strip()
if not secret:
    raise SystemExit("Discord OAuth secret is required on stdin")

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def request(method: str, path: str, data: dict | None = None):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(base + path, headers=headers, method=method, data=body)
    try:
        with urllib.request.urlopen(req) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode()
        raise RuntimeError(f"Authentik returned {error.code}: {detail}") from error


expression = '''avatar_url = None
if info.get("id") and info.get("avatar"):
    extension = "gif" if str(info["avatar"]).startswith("a_") else "png"
    avatar_url = f"https://cdn.discordapp.com/avatars/{info['id']}/{info['avatar']}.{extension}?size=128"
return {
    "username": info.get("username"),
    "email": info.get("email"),
    "name": info.get("global_name") or info.get("username"),
    "attributes": {
        "discord": {
            "id": info.get("id"),
            "username": info.get("username"),
            "global_name": info.get("global_name"),
            "avatar": avatar_url,
        }
    },
}
'''

mappings = request(
    "GET", "/api/v3/propertymappings/source/oauth/?search=Northline%20Discord&page_size=100"
)["results"]
mapping_payload = {
    "name": "Northline Discord identity and avatar",
    "expression": expression,
}
if mappings:
    mapping = request(
        "PATCH",
        f"/api/v3/propertymappings/source/oauth/{mappings[0]['pk']}/",
        mapping_payload,
    )
else:
    mapping = request("POST", "/api/v3/propertymappings/source/oauth/", mapping_payload)

sources = request("GET", "/api/v3/sources/oauth/?slug=discord&page_size=100")["results"]
source_payload = {
    "name": "Discord",
    "slug": "discord",
    "enabled": True,
    "promoted": False,
    "authentication_flow": "94eae4a3-b4a6-4699-8e46-40413848d9b3",
    "enrollment_flow": "0d06681e-6777-4911-bb42-4fce1c135d20",
    "user_property_mappings": [mapping["pk"]],
    "group_property_mappings": [],
    "user_matching_mode": "email_link",
    "provider_type": "discord",
    "consumer_key": "1535449037946355712",
    "consumer_secret": secret,
    "additional_scopes": "identify email",
}
if sources:
    source = request("PATCH", f"/api/v3/sources/oauth/{sources[0]['slug']}/", source_payload)
else:
    source = request("POST", "/api/v3/sources/oauth/", source_payload)

print(json.dumps({"source": source["name"], "mapping": mapping["name"], "configured": True}))

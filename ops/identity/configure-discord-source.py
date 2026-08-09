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
client_id = os.environ["NORTHLINE_DISCORD_CLIENT_ID"]
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
    "attributes.discord": {
        "id": info.get("id"),
        "username": info.get("username"),
        "global_name": info.get("global_name"),
        "avatar_url": avatar_url,
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
    "promoted": True,
    "authentication_flow": "94eae4a3-b4a6-4699-8e46-40413848d9b3",
    "enrollment_flow": "0d06681e-6777-4911-bb42-4fce1c135d20",
    "user_property_mappings": [mapping["pk"]],
    "group_property_mappings": [],
    "user_matching_mode": "email_link",
    "provider_type": "discord",
    "consumer_key": client_id,
    "consumer_secret": secret,
    "additional_scopes": "identify email",
}
if sources:
    source = request("PATCH", f"/api/v3/sources/oauth/{sources[0]['slug']}/", source_payload)
else:
    source = request("POST", "/api/v3/sources/oauth/", source_payload)

write_stages = request(
    "GET", "/api/v3/stages/user_write/?search=northline-source-authentication-write&page_size=20"
)["results"]
if write_stages:
    write_stage = write_stages[0]
else:
    write_stage = request(
        "POST",
        "/api/v3/stages/user_write/",
        {
            "name": "northline-source-authentication-write",
            "user_creation_mode": "never_create",
            "create_users_as_inactive": False,
        },
    )

authentication_flow = source_payload["authentication_flow"]
flow_bindings = request(
    "GET", f"/api/v3/flows/bindings/?target={authentication_flow}&page_size=100"
)["results"]
if not any(binding.get("stage") == write_stage["pk"] for binding in flow_bindings):
    request(
        "POST",
        "/api/v3/flows/bindings/",
        {"target": authentication_flow, "stage": write_stage["pk"], "order": -10},
    )

identification_stages = request("GET", "/api/v3/stages/identification/?page_size=100")["results"]
for stage in identification_stages:
    if stage["name"] != "default-authentication-identification":
        continue
    selected_sources = list(stage.get("sources", []))
    if source["pk"] not in selected_sources:
        selected_sources.append(source["pk"])
        request(
            "PATCH",
            f"/api/v3/stages/identification/{stage['pk']}/",
            {"sources": selected_sources},
        )

request(
    "PATCH",
    "/api/v3/admin/settings/",
    {"avatars": "attributes.avatar,attributes.discord.avatar_url,initials"},
)

print(json.dumps({"source": source["name"], "mapping": mapping["name"], "configured": True}))

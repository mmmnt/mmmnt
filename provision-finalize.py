#!/usr/bin/env python3
"""
Moment Discord Finalizer
=========================
Handles remaining bot-actionable setup tasks:
1. Delete #general
2. Create permanent invite link
3. Create #announcements (read-only text)
4. Set up AutoMod rules
5. Pin messages in #rules and #getting-started
6. Create GitHub webhook for #contributing
7. Create CI webhook for #ci-cd
8. Enable server widget

Requirements:
  pip install requests
"""

import requests
import time
import sys
import os
import json

BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
GUILD_ID = os.environ.get("DISCORD_GUILD_ID", "")

if not BOT_TOKEN or not GUILD_ID:
    print("Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID environment variables.")
    sys.exit(1)

BASE = "https://discord.com/api/v10"
HEADERS = {
    "Authorization": f"Bot {BOT_TOKEN}",
    "Content-Type": "application/json",
}


def api(method, path, json_data=None):
    """Make a Discord API call with rate limit handling."""
    url = f"{BASE}{path}"
    for attempt in range(5):
        resp = getattr(requests, method)(url, headers=HEADERS, json=json_data)
        if resp.status_code == 429:
            retry_after = resp.json().get("retry_after", 1)
            print(f"    Rate limited. Waiting {retry_after:.1f}s...")
            time.sleep(retry_after + 0.5)
            continue
        if resp.status_code == 204:
            time.sleep(0.4)
            return {}
        if resp.status_code >= 400:
            print(f"    ERROR {resp.status_code}: {resp.text}")
            return None
        time.sleep(0.4)
        return resp.json() if resp.text else {}
    return None


def get_channels():
    """Get all channels in the guild."""
    return api("get", f"/guilds/{GUILD_ID}/channels") or []


def find_channel(channels, name):
    """Find a channel by name."""
    for ch in channels:
        if ch.get("name") == name:
            return ch
    return None


def find_category(channels, name):
    """Find a category by name."""
    for ch in channels:
        if ch.get("name") == name and ch.get("type") == 4:
            return ch
    return None


def get_channel_messages(channel_id, limit=10):
    """Get recent messages from a channel."""
    return api("get", f"/channels/{channel_id}/messages?limit={limit}") or []


def main():
    print("""
╔══════════════════════════════════════════════════════════════╗
║  Moment Discord Finalizer                                    ║
╚══════════════════════════════════════════════════════════════╝
""")

    channels = get_channels()

    # ── 1. Delete #general ──
    print("1. Deleting #general...")
    general = find_channel(channels, "general")
    if general:
        result = api("delete", f"/channels/{general['id']}")
        if result is not None:
            print("   ✓ #general deleted")
        else:
            print("   ✗ Failed to delete #general")
    else:
        print("   ⊘ #general not found (already deleted?)")

    # ── 2. Create permanent invite link ──
    print("\n2. Creating permanent invite link...")
    # Use #rules as the invite target channel
    rules = find_channel(channels, "rules")
    if rules:
        invite = api("post", f"/channels/{rules['id']}/invites", json_data={
            "max_age": 0,       # Never expires
            "max_uses": 0,      # Unlimited uses
            "unique": True,
        })
        if invite:
            invite_url = f"https://discord.gg/{invite['code']}"
            print(f"   ✓ Permanent invite: {invite_url}")
        else:
            print("   ✗ Failed to create invite")
    else:
        print("   ✗ #rules channel not found")

    # ── 3. Create #announcements (read-only text channel) ──
    print("\n3. Creating #announcements...")
    existing_announcements = find_channel(channels, "announcements")
    if existing_announcements:
        print("   ⊘ #announcements already exists")
    else:
        welcome_cat = find_category(channels, "WELCOME")
        payload = {
            "name": "announcements",
            "type": 0,  # Regular text (type 5 needs Community)
            "topic": "Release notes, blog post drops, milestone updates.",
            "permission_overwrites": [
                {
                    "id": GUILD_ID,
                    "type": 0,
                    "deny": str(1 << 11),  # SEND_MESSAGES
                    "allow": "0",
                },
            ],
        }
        if welcome_cat:
            payload["parent_id"] = welcome_cat["id"]
        result = api("post", f"/guilds/{GUILD_ID}/channels", json_data=payload)
        if result:
            print(f"   ✓ #announcements created (ID: {result['id']}) — read-only")
        else:
            print("   ✗ Failed to create #announcements")

    # ── 4. Set up AutoMod rules ──
    print("\n4. Setting up AutoMod rules...")

    # Rule 1: Block spam / suspicious links
    spam_rule = api("post", f"/guilds/{GUILD_ID}/auto-moderation/rules", json_data={
        "name": "Block Spam",
        "event_type": 1,  # MESSAGE_SEND
        "trigger_type": 3,  # SPAM
        "actions": [
            {
                "type": 1,  # BLOCK_MESSAGE
                "metadata": {
                    "custom_message": "This message was flagged as spam and blocked automatically.",
                },
            },
        ],
        "enabled": True,
    })
    if spam_rule:
        print("   ✓ AutoMod: Block Spam rule created")
    else:
        print("   ✗ Failed to create spam rule")

    # Rule 2: Block mention spam (5+ mentions)
    mention_rule = api("post", f"/guilds/{GUILD_ID}/auto-moderation/rules", json_data={
        "name": "Mention Limit",
        "event_type": 1,  # MESSAGE_SEND
        "trigger_type": 5,  # MENTION_SPAM
        "trigger_metadata": {
            "mention_total_limit": 5,
        },
        "actions": [
            {
                "type": 1,  # BLOCK_MESSAGE
                "metadata": {
                    "custom_message": "Too many mentions. Please limit mentions to avoid spam.",
                },
            },
        ],
        "enabled": True,
    })
    if mention_rule:
        print("   ✓ AutoMod: Mention Limit rule created (max 5)")
    else:
        print("   ✗ Failed to create mention rule")

    # Rule 3: Block known slur / hate speech keywords
    keyword_rule = api("post", f"/guilds/{GUILD_ID}/auto-moderation/rules", json_data={
        "name": "Block Harmful Content",
        "event_type": 1,  # MESSAGE_SEND
        "trigger_type": 4,  # KEYWORD_PRESET
        "trigger_metadata": {
            "presets": [1, 2, 3],  # PROFANITY, SEXUAL_CONTENT, SLURS
        },
        "actions": [
            {
                "type": 1,  # BLOCK_MESSAGE
                "metadata": {
                    "custom_message": "This message was blocked for containing inappropriate content.",
                },
            },
        ],
        "enabled": True,
    })
    if keyword_rule:
        print("   ✓ AutoMod: Block Harmful Content rule created (profanity, sexual, slurs)")
    else:
        print("   ✗ Failed to create keyword preset rule")

    # ── 5. Pin messages in #rules and #getting-started ──
    print("\n5. Pinning messages...")
    for channel_name in ["rules", "getting-started"]:
        ch = find_channel(channels, channel_name)
        if not ch:
            print(f"   ✗ #{channel_name} not found")
            continue
        messages = get_channel_messages(ch["id"])
        if not messages:
            print(f"   ✗ No messages in #{channel_name}")
            continue
        pinned_count = 0
        for msg in messages:
            result = api("put", f"/channels/{ch['id']}/pins/{msg['id']}")
            if result is not None:
                pinned_count += 1
        print(f"   ✓ Pinned {pinned_count} message(s) in #{channel_name}")

    # ── 6. Create GitHub webhook for #contributing ──
    print("\n6. Creating GitHub webhook for #contributing...")
    contributing = find_channel(channels, "contributing")
    if contributing:
        webhook = api("post", f"/channels/{contributing['id']}/webhooks", json_data={
            "name": "GitHub",
        })
        if webhook:
            print(f"   ✓ Webhook created for #contributing")
            print(f"     URL: {webhook.get('url', 'N/A')}")
            print(f"     → Add this URL in GitHub repo Settings → Webhooks")
            print(f"     → Select events: Push, Pull Request, Issues, Releases")
        else:
            print("   ✗ Failed to create webhook")
    else:
        print("   ✗ #contributing not found")

    # ── 7. Create CI webhook for #ci-cd ──
    print("\n7. Creating CI webhook for #ci-cd...")
    cicd = find_channel(channels, "ci-cd")
    if cicd:
        webhook = api("post", f"/channels/{cicd['id']}/webhooks", json_data={
            "name": "CI/CD",
        })
        if webhook:
            print(f"   ✓ Webhook created for #ci-cd")
            print(f"     URL: {webhook.get('url', 'N/A')}")
            print(f"     → Add this URL in GitHub Actions workflow for build notifications")
        else:
            print("   ✗ Failed to create webhook")
    else:
        print("   ✗ #ci-cd not found")

    # ── 8. Enable server widget ──
    print("\n8. Enabling server widget...")
    # Use #rules as the widget invite channel
    rules = find_channel(channels, "rules")
    widget_payload = {
        "enabled": True,
    }
    if rules:
        widget_payload["channel_id"] = rules["id"]
    result = api("patch", f"/guilds/{GUILD_ID}/widget", json_data=widget_payload)
    if result is not None:
        print("   ✓ Server widget enabled")
        print(f"     Embed URL: https://discord.com/widget?id={GUILD_ID}")
    else:
        print("   ✗ Failed to enable widget")

    # ── Summary ──
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  Finalizer complete                                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Next steps (manual):                                        ║
║  1. Add the GitHub webhook URLs to your repo settings        ║
║  2. Add the CI webhook URL to your GitHub Actions workflow   ║
║  3. Add the invite link to your README                       ║
║  4. Enable Community Server for full announcements +         ║
║     Membership Screening + Welcome Screen                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()

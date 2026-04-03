#!/usr/bin/env python3
"""
Moment Discord Server Provisioner
===================================
One-shot script that scaffolds the entire Discord server structure.

Setup:
  1. Go to https://discord.com/developers/applications
  2. Create a new application (name it "Moment Provisioner" or whatever)
  3. Go to Bot tab → create bot → copy the token
  4. Go to OAuth2 → URL Generator:
     - Scopes: bot
     - Bot Permissions: Manage Channels, Manage Roles, Send Messages, Manage Messages
  5. Open the generated URL in browser, invite bot to your server
  6. Run: python3 provision.py
  7. Remove the bot from the server when done

Requirements:
  pip install requests
"""

import requests
import time
import sys
import os

# ── Configuration ──
BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
GUILD_ID = os.environ.get("DISCORD_GUILD_ID", "")

if not BOT_TOKEN or not GUILD_ID:
    print("""
╔══════════════════════════════════════════════════════════════╗
║  Moment Discord Provisioner                                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Set these environment variables before running:             ║
║                                                              ║
║    export DISCORD_BOT_TOKEN="your-bot-token-here"            ║
║    export DISCORD_GUILD_ID="your-server-id-here"             ║
║                                                              ║
║  To get the Guild ID: enable Developer Mode in Discord       ║
║  settings, then right-click your server name → Copy ID.      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")
    sys.exit(1)

BASE = "https://discord.com/api/v10"
HEADERS = {
    "Authorization": f"Bot {BOT_TOKEN}",
    "Content-Type": "application/json",
}

# Rate limit handling
def api(method, path, json=None):
    """Make a Discord API call with rate limit handling."""
    url = f"{BASE}{path}"
    for attempt in range(5):
        resp = getattr(requests, method)(url, headers=HEADERS, json=json)
        if resp.status_code == 429:
            retry_after = resp.json().get("retry_after", 1)
            print(f"  Rate limited. Waiting {retry_after:.1f}s...")
            time.sleep(retry_after + 0.5)
            continue
        if resp.status_code >= 400:
            print(f"  ERROR {resp.status_code}: {resp.text}")
            return None
        time.sleep(0.4)  # Stay well under rate limits
        return resp.json()
    return None


# ══════════════════════════════════════════════
# Role definitions
# ══════════════════════════════════════════════
ROLES = [
    {"name": "architect",         "color": 0x42E695, "hoist": True,  "mentionable": True},
    {"name": "developer",         "color": 0x3BB2B8, "hoist": True,  "mentionable": True},
    {"name": "sdd-practitioner",  "color": 0x5A8EA8, "hoist": True,  "mentionable": True},
    {"name": "contributor",       "color": 0x185FA5, "hoist": True,  "mentionable": True},
]

# ══════════════════════════════════════════════
# Channel structure
# ══════════════════════════════════════════════
# Each category has a name and a list of channels.
# Channel types: 0 = text, 5 = announcement
# "readonly" flag restricts @everyone from sending messages.

STRUCTURE = [
    {
        "category": "WELCOME",
        "channels": [
            {
                "name": "rules",
                "topic": "Community standards. Read before posting.",
                "type": 0,
            },
            {
                "name": "introductions",
                "topic": "Tell us who you are and what domain you're modeling. Architects, developers, product owners — all welcome. Bonus points if you've done Event Storming and can describe what happened to those sticky notes afterward.",
                "type": 0,
            },
            {
                "name": "announcements",
                "topic": "Release notes, blog post drops, milestone updates.",
                "type": 5,  # Announcement channel
                "readonly": True,
            },
            {
                "name": "pick-roles",
                "topic": "React to assign yourself a role: architect, developer, sdd-practitioner, or contributor.",
                "type": 0,
            },
        ],
    },
    {
        "category": "MOMENT DSL",
        "channels": [
            {
                "name": "getting-started",
                "topic": "Installation, first .moment file, CLI commands. If you can't get from npm install to passing tests in 30 minutes, that's a bug — tell us here.",
                "type": 0,
            },
            {
                "name": "dsl-help",
                "topic": "Syntax questions, grammar issues, manifest configuration, parse errors. Paste your .moment file and the error output. Context maps, flows, crossings, schema contracts — all fair game.",
                "type": 0,
            },
            {
                "name": "show-your-spec",
                "topic": "Share your domain models. Post your .moment files, context maps, flow timelines. This is the channel where the community proves the DSL works on real domains. Best specs get pinned and featured.",
                "type": 0,
            },
            {
                "name": "feature-requests",
                "topic": "Grammar proposals, CLI improvements, new generator targets, package feature requests. Describe the problem before the solution. Include a .moment snippet showing what you wish you could write.",
                "type": 0,
            },
        ],
    },
    {
        "category": "DOMAIN-DRIVEN DESIGN",
        "channels": [
            {
                "name": "event-storming",
                "topic": "The methodology that Moment digitizes. Facilitation techniques, remote Event Storming, big-picture vs. design-level vs. process-level. Alberto Brandolini's work and how it maps to the DSL.",
                "type": 0,
            },
            {
                "name": "bounded-contexts",
                "topic": "Spatial modeling discussions. Context maps, aggregate design, relationships (CustomerSupplier, Partnership, Conformist, ACL). How to express them in Moment and how to think about them in your domain.",
                "type": 0,
            },
            {
                "name": "temporal-modeling",
                "topic": "The thesis channel. Why the temporal dimension matters. How Event Storming captures time but existing DSLs lose it. Flows, lanes, frames, nodes, crossings, schema contracts. The missing piece in DDD tooling.",
                "type": 0,
            },
        ],
    },
    {
        "category": "SIGNAL-DRIVEN DEVELOPMENT",
        "channels": [
            {
                "name": "sdd-methodology",
                "topic": "Signal-Driven Development — the thesis that a single disciplined architect using DDD + AI can replace traditional development teams. Methodology questions, practice reports, tooling discussions.",
                "type": 0,
            },
            {
                "name": "ai-assisted-architecture",
                "topic": "Using AI as an execution partner in domain modeling, specification authoring, and architecture work. Not 'AI writes my code' — 'AI accelerates understanding.' Workflows, prompting strategies, tool chains.",
                "type": 0,
            },
            {
                "name": "blog-discussion",
                "topic": "Discussion threads for each SDD blog post. Links posted as they publish. Challenge the arguments, extend the ideas, share your own experience applying them.",
                "type": 0,
            },
        ],
    },
    {
        "category": "DEVELOPMENT",
        "channels": [
            {
                "name": "contributing",
                "topic": "PR process, Langium grammar work, package architecture (core, derive, generate, harness, viz, emit-ts, sync, schema, cli). Good first issues tagged on GitHub.",
                "type": 0,
            },
            {
                "name": "bugs",
                "topic": "Bug reports and issue triage. Include: Moment CLI version, Node version, .moment file content, full error output. Reproducible bugs get fixed fast.",
                "type": 0,
            },
            {
                "name": "ci-cd",
                "topic": "GitHub Actions, release pipeline, package publishing, CI configuration.",
                "type": 0,
            },
        ],
    },
    {
        "category": "GENERAL",
        "channels": [
            {
                "name": "off-topic",
                "topic": "Everything else. Keep the community human.",
                "type": 0,
                "slowmode": 30,
            },
            {
                "name": "jobs-and-projects",
                "topic": "DDD, event-sourcing, CQRS, and domain architecture roles. Community members hiring or looking. No recruiter spam — first-party posts only.",
                "type": 0,
            },
        ],
    },
]

# Hidden mod channel
MOD_CHANNEL = {
    "name": "mod-log",
    "topic": "Moderation log. Deleted messages, bans, warnings. Visible to admins only.",
    "type": 0,
    "private": True,
}


def get_everyone_role():
    """Get the @everyone role ID (same as guild ID)."""
    return GUILD_ID


def create_roles():
    """Create community roles."""
    print("\n═══ Creating roles ═══")
    created = {}
    for role in ROLES:
        print(f"  Creating role: @{role['name']}")
        result = api("post", f"/guilds/{GUILD_ID}/roles", json={
            "name": role["name"],
            "color": role["color"],
            "hoist": role.get("hoist", False),
            "mentionable": role.get("mentionable", True),
            "permissions": "0",  # No special permissions
        })
        if result:
            created[role["name"]] = result["id"]
            print(f"    ✓ Created (ID: {result['id']})")
        else:
            print(f"    ✗ Failed")
    return created


def create_structure(role_ids):
    """Create categories and channels."""
    print("\n═══ Creating channel structure ═══")
    everyone_id = get_everyone_role()

    for cat_def in STRUCTURE:
        cat_name = cat_def["category"]
        print(f"\n  ┌─ Category: {cat_name}")

        # Create category
        cat = api("post", f"/guilds/{GUILD_ID}/channels", json={
            "name": cat_name,
            "type": 4,  # Category
        })
        if not cat:
            print(f"  │  ✗ Failed to create category")
            continue

        cat_id = cat["id"]
        print(f"  │  ✓ Created (ID: {cat_id})")

        # Create channels in this category
        for ch_def in cat_def["channels"]:
            ch_name = ch_def["name"]
            print(f"  ├─ #{ch_name}")

            payload = {
                "name": ch_name,
                "type": ch_def.get("type", 0),
                "parent_id": cat_id,
                "topic": ch_def.get("topic", ""),
            }

            # Slowmode
            if "slowmode" in ch_def:
                payload["rate_limit_per_user"] = ch_def["slowmode"]

            # Permission overrides
            overrides = []

            # Read-only: deny SEND_MESSAGES for @everyone
            if ch_def.get("readonly"):
                overrides.append({
                    "id": everyone_id,
                    "type": 0,  # role
                    "deny": str(1 << 11),  # SEND_MESSAGES
                    "allow": "0",
                })

            if overrides:
                payload["permission_overwrites"] = overrides

            result = api("post", f"/guilds/{GUILD_ID}/channels", json=payload)
            if result:
                print(f"  │  ✓ Created (ID: {result['id']})")
            else:
                print(f"  │  ✗ Failed")

        print(f"  └─ Done: {cat_name}")

    # Create private mod-log channel (no category)
    print(f"\n  Creating private #mod-log")
    mod = api("post", f"/guilds/{GUILD_ID}/channels", json={
        "name": MOD_CHANNEL["name"],
        "type": 0,
        "topic": MOD_CHANNEL["topic"],
        "permission_overwrites": [
            {
                "id": everyone_id,
                "type": 0,
                "deny": str(1 << 10),  # VIEW_CHANNEL
                "allow": "0",
            },
        ],
    })
    if mod:
        print(f"  ✓ #mod-log created (ID: {mod['id']}) — hidden from @everyone")
    else:
        print(f"  ✗ Failed to create #mod-log")


def update_server_info():
    """Update server description if possible (requires COMMUNITY feature)."""
    print("\n═══ Server info ═══")
    print("  Note: Server description requires Community Server to be enabled.")
    print("  Recommended description:")
    print("  'Domain architecture for the AI era. Home of Moment (open-source DDD")
    print("   specification language) and Signal-Driven Development.'")


def print_summary(role_ids):
    """Print post-provisioning summary."""
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  Provisioning complete                                       ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Created:                                                    ║
║    • {len(ROLES)} roles: {', '.join('@' + r['name'] for r in ROLES)}
║    • {len(STRUCTURE)} categories with {sum(len(c['channels']) for c in STRUCTURE)} channels
║    • 1 private #mod-log channel                              ║
║                                                              ║
║  Manual steps remaining:                                     ║
║                                                              ║
║  1. Upload server icon:     moment-icon-512.png              ║
║  2. Upload server banner:   moment-discord-banner.png        ║
║  3. Enable Community Server in Server Settings               ║
║  4. Set server description                                   ║
║  5. Add bots:                                                ║
║     • Carl-bot — reaction roles in #pick-roles               ║
║       Reactions: 🏗️→@architect  💻→@developer                 ║
║                  📡→@sdd-practitioner  🔧→@contributor         ║
║     • GitHub bot — wire mmmnt/mmmnt → #contributing          ║
║     • Dyno or Carl-bot — moderation + #mod-log logging       ║
║  6. Post welcome content in #rules and #announcements        ║
║  7. Delete the default #general channel if still present     ║
║  8. Remove this provisioner bot from the server              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")


def main():
    print("""
╔══════════════════════════════════════════════════════════════╗
║  Moment Discord Server Provisioner                           ║
║  Domain architecture for the AI era                          ║
╚══════════════════════════════════════════════════════════════╝
""")

    # Verify bot has access
    print("Verifying bot access...")
    guild = api("get", f"/guilds/{GUILD_ID}")
    if not guild:
        print("ERROR: Cannot access guild. Check your GUILD_ID and bot permissions.")
        sys.exit(1)
    print(f"  ✓ Connected to: {guild['name']}")

    # Create roles
    role_ids = create_roles()

    # Create channel structure
    create_structure(role_ids)

    # Server info
    update_server_info()

    # Summary
    print_summary(role_ids)


if __name__ == "__main__":
    main()

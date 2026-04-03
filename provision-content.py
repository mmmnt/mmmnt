#!/usr/bin/env python3
"""
Moment Discord Content Provisioner
====================================
Posts initial content to channels and sets up Membership Screening.
Run AFTER provision.py has created the server structure.

Requirements:
  pip install requests
"""

import requests
import time
import sys
import os

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
        time.sleep(0.4)
        return resp.json() if resp.text else {}
    return None


def find_channel(name):
    """Find a channel by name in the guild."""
    channels = api("get", f"/guilds/{GUILD_ID}/channels")
    if not channels:
        return None
    for ch in channels:
        if ch.get("name") == name:
            return ch["id"]
    return None


def post_message(channel_id, content, embeds=None):
    """Post a message to a channel."""
    payload = {"content": content}
    if embeds:
        payload["embeds"] = embeds
    return api("post", f"/channels/{channel_id}/messages", json=payload)


# ══════════════════════════════════════════════
# Channel content
# ══════════════════════════════════════════════

RULES_CONTENT = [
    {
        "content": "",
        "embeds": [{
            "title": "Welcome to MMMNT",
            "description": (
                "Domain architecture for the AI era.\n\n"
                "This is the community home for **Moment** — an open-source "
                "domain-driven design specification language — and "
                "**Signal-Driven Development (SDD)**, a methodology for "
                "building software with disciplined architecture and AI.\n\n"
                "Whether you're an architect, developer, product owner, or "
                "just curious about DDD — you're welcome here."
            ),
            "color": 0x42E695,
        }],
    },
    {
        "content": "",
        "embeds": [{
            "title": "📋 Community Rules",
            "description": (
                "**1. Be respectful**\n"
                "Treat everyone with respect. No harassment, hate speech, or personal attacks.\n\n"
                "**2. Stay on topic**\n"
                "Use the right channel for your discussion. Check channel topics for guidance.\n\n"
                "**3. No spam or self-promotion**\n"
                "Don't post unsolicited ads, affiliate links, or repeated content. "
                "Share your work in the appropriate channels (#show-your-spec, #blog-discussion).\n\n"
                "**4. Ask good questions**\n"
                "Include context: your `.moment` file, error output, CLI version, and Node version. "
                "The more detail you provide, the faster you'll get help.\n\n"
                "**5. Share knowledge freely**\n"
                "This is an open-source community. Help others the way you'd want to be helped.\n\n"
                "**6. No piracy or leaked content**\n"
                "Respect intellectual property and licenses.\n\n"
                "**7. Follow Discord's Terms of Service**\n"
                "https://discord.com/terms"
            ),
            "color": 0x3BB2B8,
        }],
    },
    {
        "content": "",
        "embeds": [{
            "title": "🔗 Links",
            "description": (
                "**GitHub:** https://github.com/mmmnt/mmmnt\n"
                "**Issues:** https://github.com/mmmnt/mmmnt/issues\n"
                "**Discussions:** https://github.com/mmmnt/mmmnt/discussions"
            ),
            "color": 0x185FA5,
        }],
    },
]

CONTRIBUTING_CONTENT = [
    {
        "content": "",
        "embeds": [{
            "title": "Contributing to Moment",
            "description": (
                "Moment is open source and contributions are welcome. "
                "Here's how to get involved."
            ),
            "color": 0x42E695,
        }],
    },
    {
        "content": "",
        "embeds": [{
            "title": "🏗️ Repository Structure",
            "description": (
                "Moment is a monorepo with these packages:\n\n"
                "```\n"
                "packages/\n"
                "  core/        — Langium grammar, parser, AST\n"
                "  derive/      — Derivation engine\n"
                "  generate/    — Code generators\n"
                "  harness/     — Test harness\n"
                "  viz/         — Visualization\n"
                "  emit-ts/     — TypeScript emitter\n"
                "  sync/        — Sync engine\n"
                "  schema/      — Schema contracts\n"
                "  cli/         — CLI tool\n"
                "```"
            ),
            "color": 0x3BB2B8,
        }],
    },
    {
        "content": "",
        "embeds": [{
            "title": "🚀 Getting Started",
            "description": (
                "**1. Fork & clone**\n"
                "```bash\n"
                "git clone https://github.com/YOUR_USERNAME/mmmnt.git\n"
                "cd mmmnt\n"
                "```\n\n"
                "**2. Install dependencies**\n"
                "```bash\n"
                "npm install\n"
                "```\n\n"
                "**3. Build**\n"
                "```bash\n"
                "npm run build\n"
                "```\n\n"
                "**4. Run tests**\n"
                "```bash\n"
                "npm test\n"
                "```\n\n"
                "**5. Create a branch, make changes, open a PR**\n"
                "Follow conventional commits. Reference the issue number."
            ),
            "color": 0x5A8EA8,
        }],
    },
    {
        "content": "",
        "embeds": [{
            "title": "🏷️ Good First Issues",
            "description": (
                "Look for issues tagged `good first issue` on GitHub:\n"
                "https://github.com/mmmnt/mmmnt/issues?q=label%3A%22good+first+issue%22\n\n"
                "If you're unsure where to start, ask here — someone will point you in the right direction."
            ),
            "color": 0x185FA5,
        }],
    },
]

GETTING_STARTED_CONTENT = [
    {
        "content": "",
        "embeds": [{
            "title": "Getting Started with Moment",
            "description": (
                "Moment is a specification language for domain-driven design. "
                "It captures both the spatial (context maps, aggregates) and "
                "temporal (flows, events, crossings) dimensions of your domain."
            ),
            "color": 0x42E695,
        }],
    },
    {
        "content": "",
        "embeds": [{
            "title": "⚡ Quick Start",
            "description": (
                "**Install the CLI:**\n"
                "```bash\n"
                "npm install -g @mmmnt/cli\n"
                "```\n\n"
                "**Create your first spec:**\n"
                "```bash\n"
                "moment init my-domain\n"
                "cd my-domain\n"
                "```\n\n"
                "**Validate:**\n"
                "```bash\n"
                "moment check\n"
                "```\n\n"
                "If you can't get from `npm install` to passing tests in "
                "30 minutes, that's a bug — tell us here."
            ),
            "color": 0x3BB2B8,
        }],
    },
]

PICK_ROLES_CONTENT = [
    {
        "content": "",
        "embeds": [{
            "title": "Pick Your Role",
            "description": (
                "React to this message to assign yourself a role:\n\n"
                "🏗️ — **@architect** — You design systems and model domains\n"
                "💻 — **@developer** — You build and ship code\n"
                "📡 — **@sdd-practitioner** — You practice Signal-Driven Development\n"
                "🔧 — **@contributor** — You contribute to the Moment project\n\n"
                "You can pick multiple roles."
            ),
            "color": 0x42E695,
        }],
    },
]


# ══════════════════════════════════════════════
# Membership Screening (Rules Screen)
# ══════════════════════════════════════════════

MEMBERSHIP_SCREENING = {
    "description": "Welcome to the MMMNT Discord — domain architecture for the AI era.",
    "form_fields": [
        {
            "field_type": "TERMS",
            "label": "I have read and agree to the community rules in #rules.",
            "required": True,
        },
        {
            "field_type": "TERMS",
            "label": "I understand this is an open-source community and I will be respectful to all members.",
            "required": True,
        },
        {
            "field_type": "TERMS",
            "label": "I will not spam, self-promote, or post off-topic content.",
            "required": True,
        },
    ],
}


def main():
    print("""
╔══════════════════════════════════════════════════════════════╗
║  Moment Discord Content Provisioner                          ║
╚══════════════════════════════════════════════════════════════╝
""")

    # ── Post channel content ──
    channels_to_populate = [
        ("rules", RULES_CONTENT),
        ("contributing", CONTRIBUTING_CONTENT),
        ("getting-started", GETTING_STARTED_CONTENT),
        ("pick-roles", PICK_ROLES_CONTENT),
    ]

    for channel_name, messages in channels_to_populate:
        print(f"  Populating #{channel_name}...")
        channel_id = find_channel(channel_name)
        if not channel_id:
            print(f"    ✗ Channel not found")
            continue

        for msg in messages:
            result = post_message(
                channel_id,
                msg.get("content", ""),
                msg.get("embeds"),
            )
            if result:
                print(f"    ✓ Posted message")
            else:
                print(f"    ✗ Failed to post message")

    # ── Set up Membership Screening ──
    print(f"\n  Setting up Membership Screening (Rules Screen)...")
    result = api("put", f"/guilds/{GUILD_ID}/member-verification", json=MEMBERSHIP_SCREENING)
    if result is not None:
        print(f"    ✓ Membership Screening configured")
        print(f"    Note: Requires Community Server enabled to take effect.")
        print(f"    Enable it in Server Settings → Community → Enable Community.")
    else:
        print(f"    ✗ Failed — Community Server may need to be enabled first.")
        print(f"    Enable Community in Server Settings, then re-run this script,")
        print(f"    or set it up manually in Server Settings → Safety Setup → Membership Screening.")

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  Content provisioning complete                               ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Posted content to:                                          ║
║    • #rules — welcome message, community rules, links        ║
║    • #contributing — repo structure, getting started guide    ║
║    • #getting-started — quick start instructions             ║
║    • #pick-roles — role selection message                     ║
║                                                              ║
║  Manual steps:                                               ║
║    1. Enable Community Server (required for Membership       ║
║       Screening and #announcements)                          ║
║    2. Set up Carl-bot reaction roles on the #pick-roles      ║
║       message (🏗️💻📡🔧 → roles)                              ║
║    3. Pin the rules embed in #rules                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()

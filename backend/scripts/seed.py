"""
Seed demo data into Supabase via the service role (no DB password needed).

Inserts a handful of cleaned_shops (Silver) + crm_leads (Gold) so a reviewer
sees a populated Kanban board immediately, and ensures a demo admin user exists.
Idempotent: shops/leads upsert on place_id; admin is created only if missing.

Run:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m backend.scripts.seed
or via `make seed` (uses the backend container's env).
"""

import os
import httpx

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

DEMO_ADMIN_EMAIL = "demo-admin@citypulse.app"
DEMO_ADMIN_PASSWORD = "CityPulseDemo#2026"

SHOPS = [
    {
        "place_id": "seed_blr_dental_1",
        "shop_name": "BrightSmile Dental",
        "phone": "9000000001",
        "website": None,
        "address": "MG Road, Bangalore",
        "city": "Bangalore",
        "niche": "dental clinics",
        "rating": 3.4,
        "review_count": 18,
        "is_active": True,
    },
    {
        "place_id": "seed_blr_gym_1",
        "shop_name": "IronCore Fitness",
        "phone": "9000000002",
        "website": None,
        "address": "Indiranagar, Bangalore",
        "city": "Bangalore",
        "niche": "gyms",
        "rating": 3.9,
        "review_count": 64,
        "is_active": True,
    },
    {
        "place_id": "seed_koc_rest_1",
        "shop_name": "Spice Harbour",
        "phone": "9000000003",
        "website": "spiceharbour.example",
        "address": "Marine Drive, Kochi",
        "city": "Kochi",
        "niche": "restaurants",
        "rating": 4.6,
        "review_count": 220,
        "is_active": True,
    },
    {
        "place_id": "seed_koc_salon_1",
        "shop_name": "Glow Studio",
        "phone": "9000000004",
        "website": None,
        "address": "Panampilly Nagar, Kochi",
        "city": "Kochi",
        "niche": "salons",
        "rating": 3.2,
        "review_count": 9,
        "is_active": True,
    },
    {
        "place_id": "seed_mum_real_1",
        "shop_name": "Skyline Realtors",
        "phone": "9000000005",
        "website": None,
        "address": "Bandra, Mumbai",
        "city": "Mumbai",
        "niche": "real estate agents",
        "rating": 3.7,
        "review_count": 41,
        "is_active": True,
    },
    {
        "place_id": "seed_mum_yoga_1",
        "shop_name": "Asana Flow",
        "phone": "9000000006",
        "website": "asanaflow.example",
        "address": "Andheri, Mumbai",
        "city": "Mumbai",
        "niche": "yoga studios",
        "rating": 4.8,
        "review_count": 130,
        "is_active": True,
    },
    {
        "place_id": "seed_blr_bake_1",
        "shop_name": "Crumb & Co",
        "phone": "9000000007",
        "website": None,
        "address": "Koramangala, Bangalore",
        "city": "Bangalore",
        "niche": "bakeries",
        "rating": 3.1,
        "review_count": 5,
        "is_active": True,
    },
    {
        "place_id": "seed_koc_plumb_1",
        "shop_name": "QuickFix Plumbers",
        "phone": "9000000008",
        "website": None,
        "address": "Edappally, Kochi",
        "city": "Kochi",
        "niche": "plumbers",
        "rating": 3.5,
        "review_count": 27,
        "is_active": True,
    },
    {
        "place_id": "seed_mum_pet_1",
        "shop_name": "Paws & Co",
        "phone": "9000000009",
        "website": "pawsandco.example",
        "address": "Powai, Mumbai",
        "city": "Mumbai",
        "niche": "pet stores",
        "rating": 4.2,
        "review_count": 88,
        "is_active": True,
    },
    {
        "place_id": "seed_blr_auto_1",
        "shop_name": "TorqueWorks Auto",
        "phone": "9000000010",
        "website": None,
        "address": "Whitefield, Bangalore",
        "city": "Bangalore",
        "niche": "auto repair",
        "rating": 2.9,
        "review_count": 12,
        "is_active": True,
    },
]

LEADS = [
    {
        "place_id": "seed_blr_dental_1",
        "heat_score": 85,
        "reasoning": "No website and reviews under 4.0 — strong web-dev opportunity.",
        "status": "new",
    },
    {
        "place_id": "seed_blr_gym_1",
        "heat_score": 60,
        "reasoning": "No website but solid review volume; needs a booking site.",
        "status": "new",
    },
    {
        "place_id": "seed_koc_rest_1",
        "heat_score": 25,
        "reasoning": "Website present, high rating and reviews — low priority.",
        "status": "lost",
    },
    {
        "place_id": "seed_koc_salon_1",
        "heat_score": 90,
        "reasoning": "No website, very low reviews — high-intent lead.",
        "status": "contacting",
    },
    {
        "place_id": "seed_mum_real_1",
        "heat_score": 70,
        "reasoning": "No website; real estate benefits heavily from listings site.",
        "status": "new",
    },
    {
        "place_id": "seed_mum_yoga_1",
        "heat_score": 30,
        "reasoning": "Strong existing digital footprint — low priority.",
        "status": "won",
    },
    {
        "place_id": "seed_blr_bake_1",
        "heat_score": 88,
        "reasoning": "No website and very few reviews — needs full digital presence.",
        "status": "new",
    },
    {
        "place_id": "seed_koc_plumb_1",
        "heat_score": 65,
        "reasoning": "No website; local-SEO + lead form would convert.",
        "status": "contacting",
    },
    {
        "place_id": "seed_mum_pet_1",
        "heat_score": 40,
        "reasoning": "Website exists; could improve SEO and reviews.",
        "status": "new",
    },
    {
        "place_id": "seed_blr_auto_1",
        "heat_score": 92,
        "reasoning": "No website, rating below 3.0 — reputation + web help needed.",
        "status": "new",
    },
]


def _upsert(table: str, rows: list, on_conflict: str) -> None:
    r = httpx.post(
        f"{URL}/rest/v1/{table}?on_conflict={on_conflict}",
        headers={**H, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=rows,
        timeout=30,
    )
    r.raise_for_status()
    print(f"  upserted {len(rows)} → {table}")


def _ensure_admin() -> None:
    listing = httpx.get(
        f"{URL}/auth/v1/admin/users?per_page=200", headers=H, timeout=30
    )
    listing.raise_for_status()
    users = listing.json().get("users", [])
    if any(u.get("email") == DEMO_ADMIN_EMAIL for u in users):
        print(f"  admin {DEMO_ADMIN_EMAIL} already exists")
        return
    r = httpx.post(
        f"{URL}/auth/v1/admin/users",
        headers=H,
        json={
            "email": DEMO_ADMIN_EMAIL,
            "password": DEMO_ADMIN_PASSWORD,
            "email_confirm": True,
            "app_metadata": {"role": "admin"},
        },
        timeout=30,
    )
    r.raise_for_status()
    print(f"  created admin {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}")


def main() -> None:
    print("Seeding CityPulse demo data…")
    _upsert("cleaned_shops", SHOPS, "place_id")  # Silver first (FK target)
    _upsert("crm_leads", LEADS, "place_id")  # Gold references cleaned_shops
    _ensure_admin()
    print("Seed complete. Log in as the demo admin to explore the board.")


if __name__ == "__main__":
    main()

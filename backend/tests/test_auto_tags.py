"""Tests for scraped-lead auto-tagging helpers (F2)."""

from backend.ai_pipeline import scorer


def test_heat_tier_thresholds():
    # Mirrors the frontend getHeatScoreClass thresholds.
    assert scorer._heat_tier(100) == "hot"
    assert scorer._heat_tier(70) == "hot"
    assert scorer._heat_tier(69) == "warm"
    assert scorer._heat_tier(40) == "warm"
    assert scorer._heat_tier(39) == "cold"
    assert scorer._heat_tier(0) == "cold"


def test_auto_tags_niche_city_tier_normalised():
    shop = {"niche": "Restaurants", "city": "  Kochi "}
    assert scorer._lead_auto_tags(shop, 85) == ["restaurants", "kochi", "hot"]


def test_auto_tags_skips_blank_fields_but_always_has_tier():
    assert scorer._lead_auto_tags({"niche": "", "city": None}, 30) == ["cold"]
    assert scorer._lead_auto_tags({"niche": "gyms"}, 55) == ["gyms", "warm"]

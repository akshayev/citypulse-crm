"""Tests for the medallion data-quality contracts (Silver/Gold write gates)."""

import pytest
from pydantic import ValidationError

from backend.ai_pipeline.contracts import CleanedShop, ScoredLead


def test_cleaned_shop_valid():
    s = CleanedShop(place_id="p1", shop_name="Joe's Pizza", rating=4.5, review_count=12)
    assert s.place_id == "p1"
    assert s.rating == 4.5
    assert s.review_count == 12


def test_cleaned_shop_allows_missing_optionals():
    s = CleanedShop(place_id="p1", shop_name="Joe's Pizza")
    assert s.rating is None
    assert s.review_count == 0
    assert s.phone is None


@pytest.mark.parametrize("rating", [-0.5, 5.1, 99])
def test_cleaned_shop_rating_out_of_range_rejected(rating):
    with pytest.raises(ValidationError):
        CleanedShop(place_id="p1", shop_name="Joe's", rating=rating)


def test_cleaned_shop_blank_name_rejected():
    with pytest.raises(ValidationError):
        CleanedShop(place_id="p1", shop_name="   ")


def test_cleaned_shop_empty_place_id_rejected():
    with pytest.raises(ValidationError):
        CleanedShop(place_id="", shop_name="Joe's")


def test_cleaned_shop_negative_reviews_rejected():
    with pytest.raises(ValidationError):
        CleanedShop(place_id="p1", shop_name="Joe's", review_count=-3)


def test_scored_lead_valid_dump():
    lead = ScoredLead(place_id="p1", heat_score=80, reasoning="No website found.")
    assert lead.model_dump() == {
        "place_id": "p1",
        "heat_score": 80,
        "reasoning": "No website found.",
    }


@pytest.mark.parametrize("score", [-1, 101, 1000])
def test_scored_lead_heat_score_range_rejected(score):
    with pytest.raises(ValidationError):
        ScoredLead(place_id="p1", heat_score=score, reasoning="x")


def test_scored_lead_blank_reasoning_rejected():
    with pytest.raises(ValidationError):
        ScoredLead(place_id="p1", heat_score=50, reasoning="   ")

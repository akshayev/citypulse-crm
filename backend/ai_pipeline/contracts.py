"""
CityPulse CRM — Data Contracts (Data Quality gates between medallion layers)

Bronze stays intentionally schemaless (raw scrape JSON is captured as-is).
Quality is enforced at the layer *boundaries*:

  - CleanedShop  → the Silver write contract (cleaner.py validates before upsert)
  - ScoredLead   → the Gold write contract (scorer.py validates before upsert)

A record that fails its contract is *quarantined* (skipped + counted) rather
than written, so bad data never reaches the serving layer. These are plain
Pydantic models (already a project dependency); for DataFrame-heavy pipelines
the same idea is usually expressed with pandera/Great Expectations.
"""

from pydantic import BaseModel, Field, field_validator


class CleanedShop(BaseModel):
    """Silver-layer write contract for a row going into cleaned_shops."""

    place_id: str = Field(min_length=1)
    shop_name: str = Field(min_length=1)
    phone: str | None = None
    website: str | None = None
    address: str | None = None
    city: str | None = None
    niche: str | None = None
    rating: float | None = Field(default=None, ge=0, le=5)
    review_count: int = Field(default=0, ge=0)
    is_active: bool = True
    raw_scrape_id: str | None = None
    lat_lng: str | None = None

    @field_validator("shop_name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("shop_name must not be blank")
        return v


class ScoredLead(BaseModel):
    """Gold-layer write contract for a row going into crm_leads."""

    place_id: str = Field(min_length=1)
    heat_score: int = Field(ge=0, le=100)
    reasoning: str = Field(min_length=1)

    @field_validator("reasoning")
    @classmethod
    def _reasoning_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reasoning must not be blank")
        return v

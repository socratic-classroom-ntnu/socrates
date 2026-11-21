"""The browser-facing solo citation source is one documented OpenAPI component."""

from app.classroom_app import create_app
from app.modules.solo_activity.contracts import CitationSourceView


def test_citation_source_schema_defines_utf16_half_open_offsets():
    schema = CitationSourceView.model_json_schema()

    assert set(schema["properties"]) == {"message_id", "quote", "start", "end"}
    assert set(schema["required"]) == {"message_id", "quote", "start", "end"}
    assert "message_ref" not in schema["properties"]
    assert "first exact occurrence" in schema["description"]

    start = schema["properties"]["start"]
    end = schema["properties"]["end"]
    assert start["minimum"] == 0
    assert end["minimum"] == 1
    assert "UTF-16 code units" in start["description"]
    assert "inclusive" in start["description"]
    assert "first exact occurrence" in start["description"]
    assert "UTF-16 code units" in end["description"]
    assert "exclusive" in end["description"]


def test_solo_summary_sources_reuse_the_public_citation_component():
    schemas = create_app(background=False).openapi()["components"]["schemas"]

    sources = schemas["PersonalSummaryView"]["properties"]["sources"]
    assert sources["items"] == {"$ref": "#/components/schemas/CitationSourceView"}
    assert "CitationSourceView" in schemas

import json
from pathlib import Path
from typing import Any, Dict, List


def make_profile(
    *,
    profile_id: str,
    display_name: str,
    preferred_name: str,
    full_name: str,
    title: str,
    party: str,
    district: str,
    state: str,
    office_type: str,
    jurisdiction: str,
    current_office: str,
    official_website: str,
    campaign_website: str = "",
    bioguide_id: str = "",
    open_states_person_id: str = "",
    policy_note_search: str = "",
    short_bio: str = "",
    standard_bio: str = "",
    source_note: str = "",
) -> Dict[str, Any]:
    is_federal = office_type.lower() == "federal"
    encoded_name = full_name.replace(" ", "%20")

    if not policy_note_search:
      policy_note_search = f"https://data.policynote.com/v1/people/search?name={encoded_name}"

    source_identity = {
        "bioguideId": bioguide_id,
        "fecCandidateId": "",
        "fecPrincipalCommitteeId": "",
        "policyNotePersonId": "",
        "policyNoteEntityId": "",
        "googleKnowledgeGraphMid": "",
        "youtubeChannelId": "",
        "openStatesPersonId": open_states_person_id,
        "stateLegislatureId": "",
        "stateCampaignFinanceId": "",
    }

    source_endpoints = {
        "congressSponsoredLegislation": (
            f"https://api.congress.gov/v3/member/{bioguide_id}/sponsored-legislation"
            if bioguide_id else ""
        ),
        "congressCosponsoredLegislation": (
            f"https://api.congress.gov/v3/member/{bioguide_id}/cosponsored-legislation"
            if bioguide_id else ""
        ),
        "fecReceipts": "",
        "fecDisbursements": "",
        "fecIndependentExpenditures": "",
        "policyNoteSearch": policy_note_search,
        "googleFactCheckSearch": f"https://factchecktools.googleapis.com/v1alpha1/claims:search?query={encoded_name}",
        "googleCivicVoterInfo": "https://www.googleapis.com/civicinfo/v2/voterinfo",
        "youtubeSearch": "https://www.googleapis.com/youtube/v3/search",
        "googleCustomSearch": "https://www.googleapis.com/customsearch/v1",
    }

    proof_status = {
        "identityHub": "Seeded v0.9 profile",
        "universalProfile": "Partial",
        "biography": "Partial",
        "headshot": "Missing",
        "officialLinks": "Partial" if official_website else "Missing",
        "committees": "Not started",
        "raceContext": "Scaffolded",
        "factCheckIndex": "Not started",
        "mediaTracking": "Not started",
        "deepCampaignFinance": "Not started" if is_federal else "State source required",
        "legislativeMechanics": "Congress.gov ID available" if bioguide_id else "State source required",
        "verbalRecords": "Not started",
        "politicalGeography": "Scaffolded",
        "powerMapping": "Not started",
        "alertingInfrastructure": "Polling required",
    }

    return {
        "id": profile_id,
        "displayName": display_name,
        "preferredName": preferred_name,
        "fullName": full_name,
        "title": title,
        "party": party,
        "district": district,
        "state": state,
        "officeType": office_type,
        "jurisdiction": jurisdiction,
        "currentOffice": current_office,
        "active": True,
        "reelectionYear": 2026 if is_federal else None,
        "pronunciation": "",
        "birthPlace": "",
        "birthday": "",
        "family": "",
        "photoUrl": "",
        "profileCompletion": {
            "universalReference": "Partial" if (bioguide_id or open_states_person_id) else "Not started",
            "bioLibrary": "Partial" if (short_bio or standard_bio) else "Not started",
            "headshot": "Missing",
            "contact": "Partial" if official_website else "Not started",
            "committees": "Not started",
            "sourceIds": "Partial" if (bioguide_id or open_states_person_id) else "Not started",
            "intelligence": "Scaffolded",
            "dataQuality": "Partial",
            "sourceTracking": "Partial",
        },
        "headshot": {
            "primaryUrl": "",
            "source": "",
            "altText": f"Headshot of {full_name}",
            "usageNote": "Missing. Add an official or campaign-approved image URL.",
        },
        "bio": {
            "oneLine": f"{full_name} is a {party} {current_office}.",
            "short": short_bio,
            "standard": standard_bio,
            "long": "",
            "plainEnglish": "",
        },
        "universalProfile": {
            "preferredName": preferred_name,
            "fullName": full_name,
            "title": title,
            "party": party,
            "district": district,
            "jurisdiction": jurisdiction,
            "currentOffice": current_office,
            "activeStatus": "Active",
            "reelectionYear": 2026 if is_federal else "",
            "pronunciation": "",
            "birthday": "",
            "birthplace": "",
            "family": "",
        },
        "officialLinks": {
            "officialWebsite": official_website,
            "contactForm": "",
            "campaignWebsite": campaign_website,
            "congressGovProfile": f"https://bioguide.congress.gov/search/bio/{bioguide_id}" if bioguide_id else "",
            "ballotpedia": "",
            "wikipedia": "",
            "youtubeChannelTitle": "",
            "youtubeChannelId": "",
            "policyNoteSearch": policy_note_search,
        },
        "phones": [],
        "offices": [],
        "webHandles": [
            item for item in [
                {"label": "Official Website", "value": official_website} if official_website else None,
                {"label": "Campaign Website", "value": campaign_website} if campaign_website else None,
                {"label": "PolicyNote Search", "value": policy_note_search} if policy_note_search else None,
            ] if item
        ],
        "committees": [],
        "caucuses": [],
        "sourceIdentity": source_identity,
        "dataQualityNotes": [
            {
                "label": "Seed profile",
                "value": "Added in Proof Build v0.9 as part of the real profile expansion sprint.",
                "severity": "note",
                "owner": "research",
                "lastChecked": "2026-06-02",
            },
            {
                "label": "Needs source deepening",
                "value": "This profile has identity and official-link scaffolding only. Committee, finance, media, and race modules still need enrichment.",
                "severity": "warning",
                "owner": "research",
                "lastChecked": "2026-06-02",
            },
            {
                "label": "Missing headshot",
                "value": "Add an official or campaign-approved image URL.",
                "severity": "warning",
                "owner": "research",
                "lastChecked": "2026-06-02",
            },
            {
                "label": "Source note",
                "value": source_note,
                "severity": "note",
                "owner": "research",
                "lastChecked": "2026-06-02",
            },
        ],
        "sourceTracking": [
            {
                "label": "Official website",
                "value": official_website,
                "type": "official-site",
                "sourceName": "Official office website",
                "sourceUrl": official_website,
                "lastChecked": "2026-06-02",
                "confidence": "High",
            },
            {
                "label": "Campaign website",
                "value": campaign_website,
                "type": "campaign-site",
                "sourceName": "Campaign website",
                "sourceUrl": campaign_website,
                "lastChecked": "2026-06-02",
                "confidence": "Medium",
            } if campaign_website else None,
            {
                "label": "Bioguide",
                "value": bioguide_id,
                "type": "federal-id",
                "sourceName": "Biographical Directory of the U.S. Congress",
                "sourceUrl": f"https://bioguide.congress.gov/search/bio/{bioguide_id}",
                "lastChecked": "2026-06-02",
                "confidence": "High",
            } if bioguide_id else None,
            {
                "label": "PolicyNote search",
                "value": policy_note_search,
                "type": "api-search",
                "sourceName": "PolicyNote",
                "sourceUrl": policy_note_search,
                "lastChecked": "2026-06-02",
                "confidence": "Needs verification",
            },
        ],
        "campaignFinanceSnapshot": {
            "committeeName": "",
            "fecCandidateId": "",
            "fecPrincipalCommitteeId": "",
            "itemizedReceiptsReturned": "",
            "itemizedDisbursementsReturned": "",
            "independentExpendituresReturned": "",
            "latestReceiptDateSeen": "",
            "latestDisbursementDateSeen": "",
            "outsideSpenderProofExample": "",
            "proofNotes": "" if is_federal else "State-level campaign finance should be handled separately from federal OpenFEC records.",
        },
        "raceContext": {
            "moduleStatus": "Scaffolded",
            "electionCycle": "2026" if is_federal else "",
            "office": title,
            "district": district,
            "incumbentStatus": "Incumbent",
            "reelectionYear": 2026 if is_federal else "",
            "openSeatStatus": "Not populated yet",
            "declaredChallengers": "Not populated yet",
            "filingDeadline": "Not populated yet",
            "electionRulesSource": "State election authority / official source required",
            "opponentDataSource": "Not populated yet",
            "implementationNote": "Seed profile only. Needs race-specific enrichment.",
        },
        "factCheckIndex": {
            "moduleStatus": "Not started",
            "googleFactCheckQuery": full_name,
            "latestProofResult": "",
            "sourceApi": "Google Fact Check Tools API",
            "intendedUse": "Track verified third-party fact-checks of claims made by or about the official.",
            "implementationNote": "Not populated yet.",
        },
        "mediaTracking": {
            "moduleStatus": "Not started",
            "youtubeChannelTitle": "",
            "youtubeChannelId": "",
            "youtubeSearchResultsReturned": "",
            "officialChannelPublishedAt": "",
            "proofVideos": [],
            "publicCommentaryStatus": "Not populated yet",
            "sentimentStatus": "Requires separate sentiment analysis layer",
            "implementationNote": "Not populated yet.",
        },
        "webClippings": {
            "moduleStatus": "Not started",
            "sourceApi": "Google Custom Search JSON API",
            "queryPattern": full_name,
            "currentStatus": "Not populated yet",
            "intendedUse": "Track public web mentions, news clips, interviews, releases, and other searchable web results.",
            "implementationNote": "Not populated yet.",
        },
        "deepCampaignFinance": {
            "moduleStatus": "Not started" if is_federal else "State source required",
            "receiptsEndpoint": "",
            "disbursementsEndpoint": "",
            "independentExpendituresEndpoint": "",
            "receiptsAvailable": "",
            "disbursementsAvailable": "",
            "independentExpendituresAvailable": "",
            "donorFieldsToTrack": "",
            "spendingFieldsToTrack": "",
            "outsideMoneyFieldsToTrack": "",
            "implementationNote": "Federal profile needs FEC IDs." if is_federal else "State profile needs state campaign finance source wiring.",
        },
        "legislativeMechanics": {
            "moduleStatus": "Scaffolded",
            "bioguideId": bioguide_id,
            "sponsoredLegislationCount": "",
            "cosponsoredLegislationStatus": "",
            "votingRecordStatus": "",
            "sponsoredLegislationEndpoint": source_endpoints["congressSponsoredLegislation"],
            "cosponsoredLegislationEndpoint": source_endpoints["congressCosponsoredLegislation"],
            "votingRecordEndpointStatus": "Needs roll call vote wiring" if is_federal else "Needs state legislative source wiring",
            "implementationNote": "Congress.gov Bioguide available." if bioguide_id else "No federal legislative ID available.",
        },
        "verbalRecords": {
            "moduleStatus": "Not started",
            "sourceApi": "",
            "primarySource": "",
            "currentStatus": "",
            "intendedUse": "Track floor speeches, remarks, debate participation, and verbal mentions.",
            "parserRequirement": "",
            "implementationNote": "Not populated yet.",
        },
        "politicalGeography": {
            "moduleStatus": "Scaffolded",
            "district": district,
            "state": state,
            "googleCivicStatus": "",
            "electionAdministrationBody": "",
            "electionInfoUrl": "",
            "voterRegistrationUrl": "",
            "voterRegistrationConfirmationUrl": "",
            "absenteeVotingInfoUrl": "",
            "votingLocationFinderUrl": "",
            "ballotInfoUrl": "",
            "implementationNote": "Needs district and election source enrichment.",
        },
        "powerMapping": {
            "moduleStatus": "Not started",
            "sourceApi": "",
            "staffDirectoryStatus": "Not populated yet",
            "stakeholderDirectoryStatus": "Not populated yet",
            "committeeGatekeeperStatus": "Not populated yet",
            "intendedUse": "Track staffers, aides, committee staff, caucus contacts, and stakeholder relationships connected to the official.",
            "implementationNote": "Not populated yet.",
        },
        "alertingInfrastructure": {
            "moduleStatus": "Scaffolded",
            "currentStatus": "Not live",
            "dataSourceType": "REST APIs",
            "alertBehavior": "Requires scheduled polling",
            "schedulerRequirement": "A scheduled task or backend worker must poll sources and compare new results against stored prior results.",
            "suggestedPollingTargets": "Official website updates, source endpoints, media search, fact-check search, and legislative or campaign finance sources.",
            "implementationNote": "Alerts should be generated from detected changes, not from page refreshes.",
        },
        "sourceEndpoints": source_endpoints,
        "proofStatus": proof_status,
    }


PROFILES: List[Dict[str, Any]] = [
    make_profile(
        profile_id="marie-gluesenkamp-perez",
        display_name="Marie Gluesenkamp Perez",
        preferred_name="Marie",
        full_name="Marie Gluesenkamp Perez",
        title="Representative",
        party="Democratic",
        district="WA-03",
        state="WA",
        office_type="Federal",
        jurisdiction="United States House of Representatives",
        current_office="U.S. Representative for Washington's 3rd Congressional District",
        official_website="https://gluesenkampperez.house.gov",
        campaign_website="https://marieforcongress.com",
        bioguide_id="G000600",
        short_bio="Marie Gluesenkamp Perez represents Washington's 3rd Congressional District in the U.S. House.",
        standard_bio="Marie Gluesenkamp Perez is a Democratic U.S. Representative for Washington's 3rd Congressional District. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official House site and Bioguide identity checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="jared-golden",
        display_name="Jared Golden",
        preferred_name="Jared",
        full_name="Jared Golden",
        title="Representative",
        party="Democratic",
        district="ME-02",
        state="ME",
        office_type="Federal",
        jurisdiction="United States House of Representatives",
        current_office="U.S. Representative for Maine's 2nd Congressional District",
        official_website="https://golden.house.gov",
        campaign_website="https://jaredgoldenforcongress.com",
        bioguide_id="G000592",
        short_bio="Jared Golden represents Maine's 2nd Congressional District in the U.S. House.",
        standard_bio="Jared Golden is a Democratic U.S. Representative for Maine's 2nd Congressional District. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official House site and Bioguide identity checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="don-davis",
        display_name="Don Davis",
        preferred_name="Don",
        full_name="Don Davis",
        title="Representative",
        party="Democratic",
        district="NC-01",
        state="NC",
        office_type="Federal",
        jurisdiction="United States House of Representatives",
        current_office="U.S. Representative for North Carolina's 1st Congressional District",
        official_website="https://dondavis.house.gov",
        campaign_website="https://votedondavis.com",
        bioguide_id="D000230",
        short_bio="Don Davis represents North Carolina's 1st Congressional District in the U.S. House.",
        standard_bio="Don Davis is a Democratic U.S. Representative for North Carolina's 1st Congressional District. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official House site and Bioguide identity checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="greg-landsman",
        display_name="Greg Landsman",
        preferred_name="Greg",
        full_name="Greg Landsman",
        title="Representative",
        party="Democratic",
        district="OH-01",
        state="OH",
        office_type="Federal",
        jurisdiction="United States House of Representatives",
        current_office="U.S. Representative for Ohio's 1st Congressional District",
        official_website="https://landsman.house.gov",
        campaign_website="https://www.landsmanforcongress.com",
        bioguide_id="L000601",
        short_bio="Greg Landsman represents Ohio's 1st Congressional District in the U.S. House.",
        standard_bio="Greg Landsman is a Democratic U.S. Representative for Ohio's 1st Congressional District. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official House site and Bioguide identity checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="pat-ryan",
        display_name="Pat Ryan",
        preferred_name="Pat",
        full_name="Pat Ryan",
        title="Representative",
        party="Democratic",
        district="NY-18",
        state="NY",
        office_type="Federal",
        jurisdiction="United States House of Representatives",
        current_office="U.S. Representative for New York's 18th Congressional District",
        official_website="https://patryan.house.gov",
        campaign_website="https://www.patryanforcongress.com",
        bioguide_id="R000579",
        short_bio="Pat Ryan represents New York's 18th Congressional District in the U.S. House.",
        standard_bio="Pat Ryan is a Democratic U.S. Representative for New York's 18th Congressional District. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official House site and Bioguide identity checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="josh-stein",
        display_name="Josh Stein",
        preferred_name="Josh",
        full_name="Josh Stein",
        title="Governor",
        party="Democratic",
        district="Statewide",
        state="NC",
        office_type="State",
        jurisdiction="State of North Carolina",
        current_office="Governor of North Carolina",
        official_website="https://governor.nc.gov",
        campaign_website="https://www.joshstein.org",
        short_bio="Josh Stein is the Governor of North Carolina.",
        standard_bio="Josh Stein is a Democratic state executive serving as Governor of North Carolina. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official governor website checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="jeff-jackson",
        display_name="Jeff Jackson",
        preferred_name="Jeff",
        full_name="Jeff Jackson",
        title="Attorney General",
        party="Democratic",
        district="Statewide",
        state="NC",
        office_type="State",
        jurisdiction="State of North Carolina",
        current_office="Attorney General of North Carolina",
        official_website="https://ncdoj.gov",
        campaign_website="https://www.jeffjacksonnc.com",
        short_bio="Jeff Jackson is the Attorney General of North Carolina.",
        standard_bio="Jeff Jackson is a Democratic state executive serving as Attorney General of North Carolina. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official North Carolina Department of Justice site checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="maura-healey",
        display_name="Maura Healey",
        preferred_name="Maura",
        full_name="Maura Healey",
        title="Governor",
        party="Democratic",
        district="Statewide",
        state="MA",
        office_type="State",
        jurisdiction="Commonwealth of Massachusetts",
        current_office="Governor of Massachusetts",
        official_website="https://www.mass.gov/orgs/governor-maura-healey-and-lt-governor-kim-driscoll",
        campaign_website="https://maurahealey.com",
        short_bio="Maura Healey is the Governor of Massachusetts.",
        standard_bio="Maura Healey is a Democratic state executive serving as Governor of Massachusetts. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official Massachusetts governor page checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="wes-moore",
        display_name="Wes Moore",
        preferred_name="Wes",
        full_name="Wes Moore",
        title="Governor",
        party="Democratic",
        district="Statewide",
        state="MD",
        office_type="State",
        jurisdiction="State of Maryland",
        current_office="Governor of Maryland",
        official_website="https://governor.maryland.gov",
        campaign_website="https://wesmoore.com",
        short_bio="Wes Moore is the Governor of Maryland.",
        standard_bio="Wes Moore is a Democratic state executive serving as Governor of Maryland. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official Maryland governor website checked during v0.9 seed pass.",
    ),
    make_profile(
        profile_id="mallory-mcmorrow",
        display_name="Mallory McMorrow",
        preferred_name="Mallory",
        full_name="Mallory McMorrow",
        title="State Senator",
        party="Democratic",
        district="MI-SD-08",
        state="MI",
        office_type="State",
        jurisdiction="Michigan Senate",
        current_office="Michigan State Senator for the 8th Senate District",
        official_website="https://senatedems.com/mcmorrow/bio/",
        campaign_website="https://www.mcmorrowformichigan.com",
        short_bio="Mallory McMorrow represents Michigan's 8th Senate District.",
        standard_bio="Mallory McMorrow is a Democratic Michigan State Senator representing the 8th Senate District. This seed profile is intentionally partial and ready for source enrichment.",
        source_note="Official Michigan Senate Democratic profile checked during v0.9 seed pass.",
    ),
]


def load_people(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Could not find {path}")

    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, list):
        raise ValueError("data/people.json must be a top-level JSON array.")

    return data


def upsert_profiles(existing_people: List[Dict[str, Any]], seed_profiles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id = {person.get("id"): person for person in existing_people if person.get("id")}
    output: List[Dict[str, Any]] = []

    for person in existing_people:
        person_id = person.get("id")
        replacement = by_id.get(person_id)
        output.append(replacement if replacement else person)

    existing_ids = {person.get("id") for person in output}

    for seed_profile in seed_profiles:
        seed_id = seed_profile["id"]

        if seed_id in existing_ids:
            output = [
                seed_profile if person.get("id") == seed_id else person
                for person in output
            ]
            print(f"Updated existing profile: {seed_id}")
        else:
            output.append(seed_profile)
            existing_ids.add(seed_id)
            print(f"Added new profile: {seed_id}")

    return output


def write_people(path: Path, people: List[Dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(people, file, indent=2, ensure_ascii=False)
        file.write("\n")


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    people_path = project_root / "data" / "people.json"

    people = load_people(people_path)
    updated_people = upsert_profiles(people, PROFILES)
    write_people(people_path, updated_people)

    print("")
    print(f"Done. data/people.json now contains {len(updated_people)} profiles.")
    print("Run the local server and hard refresh the browser to test v0.9.")


if __name__ == "__main__":
    main()
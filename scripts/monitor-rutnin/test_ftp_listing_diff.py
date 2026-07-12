from ftp_listing_diff import build_discord_fields, diff_listings, has_changes


def test_logs_mtime_change_is_modified_not_added_removed():
    old = ["drwxr-xr-x  2 qpc  psacln  12288 Jun 17 08:28 logs"]
    new = ["drwxr-xr-x  2 qpc  psacln  12288 Jun 18 11:24 logs"]

    diff = diff_listings(old, new)

    assert diff["added"] == []
    assert diff["removed"] == []
    assert len(diff["modified"]) == 1
    assert diff["modified"][0]["name"] == "logs"
    assert "mtime Jun 17 08:28 -> Jun 18 11:24" in diff["modified"][0]["changes"]


def test_new_and_deleted_files():
    old = ["-rw-r--r--  1 qpc  psacln  100 Jun 17 08:28 old.php"]
    new = ["-rw-r--r--  1 qpc  psacln  200 Jun 18 11:24 new.php"]

    diff = diff_listings(old, new)

    assert [item["name"] for item in diff["added"]] == ["new.php"]
    assert [item["name"] for item in diff["removed"]] == ["old.php"]
    assert diff["modified"] == []


def test_discord_fields_include_filename():
    diff = diff_listings(
        ["drwxr-xr-x  2 qpc  psacln  12288 Jun 17 08:28 logs"],
        ["drwxr-xr-x  2 qpc  psacln  12288 Jun 18 11:24 logs"],
    )

    assert has_changes(diff)
    fields = build_discord_fields(diff)
    assert fields[0]["name"] == "Modified (1)"
    assert "**logs**" in fields[0]["value"]

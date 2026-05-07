extends Node
class_name PhotoEvaluator

## Score a single-item photo.
## target_id: the catalog id the request asked the player to photograph.
## focused_id: the catalog id the camera was focused on at shutter time
##   (empty string if the camera was in overview).
## request: the active request dictionary.
static func score_single(target_id: String, focused_id: String, request: Dictionary) -> int:
	var score: int = 30
	if focused_id != "" and focused_id == target_id:
		score += 20
	var theme: String = String(request.get("theme", ""))
	if theme != "" and Catalog.has_tag(target_id, theme):
		score += 50
	return clampi(score, 0, 100)

## Score the coordinated/overview photo of the whole room.
## placed_items: an array from PlacementController.get_placed_snapshot()
##   (each entry has at least { "id": String }).
static func score_coordinate(placed_items: Array, request: Dictionary) -> Dictionary:
	var theme: String = String(request.get("theme", ""))
	var preferred_categories: Array = request.get("preferred_categories", [])
	var preferred_tags: Array = request.get("preferred_tags", [])
	var score: int = 50
	var theme_matches: int = 0
	var category_hits: Dictionary = {}
	var tag_hits: int = 0
	var distinct_categories: Dictionary = {}
	for entry in placed_items:
		var id: String = entry.get("id", "")
		if id == "":
			continue
		var cat: String = Catalog.get_category(id)
		var item_tags: Array = Catalog.get_tags(id)
		distinct_categories[cat] = true
		if theme != "" and item_tags.has(theme):
			theme_matches += 1
		if preferred_categories.has(cat):
			category_hits[cat] = true
		for t in item_tags:
			if preferred_tags.has(t):
				tag_hits += 1
				break
	score += min(theme_matches, 5) * 20
	score += category_hits.size() * 30
	score += min(tag_hits, 5) * 10
	score += min(distinct_categories.size(), 5) * 10
	score = clampi(score, 0, 400)
	return {
		"score": score,
		"theme_matches": theme_matches,
		"category_hits": category_hits.keys(),
		"tag_hits": tag_hits,
		"variety": distinct_categories.size()
	}

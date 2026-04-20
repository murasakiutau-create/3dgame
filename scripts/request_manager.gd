extends Node
class_name RequestManager

const REQUESTS_PATH := "res://data/requests.json"

signal request_changed(request: Dictionary)
signal completion_checked(result: Dictionary)

var _all: Array = []
var _current: Dictionary = {}

func _ready() -> void:
	_load()
	if _all.size() > 0:
		start_request(_all[0].get("id", ""))

func _load() -> void:
	var f := FileAccess.open(REQUESTS_PATH, FileAccess.READ)
	if f == null:
		push_error("Requests JSON missing: %s" % REQUESTS_PATH)
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if typeof(parsed) == TYPE_ARRAY:
		_all = parsed

func start_request(id: String) -> void:
	for r in _all:
		if r.get("id", "") == id:
			_current = r
			request_changed.emit(r)
			return

func current_request() -> Dictionary:
	return _current

func check_completion(placement: PlacementController) -> Dictionary:
	var counts: Dictionary = placement.count_placed_by_id()
	var required: Array = _current.get("required", [])
	var missing: Array = []
	var complete: bool = true
	for req in required:
		var id: String = req.get("id", "")
		var need: int = int(req.get("min", 1))
		var have: int = int(counts.get(id, 0))
		if have < need:
			complete = false
		missing.append({ "id": id, "need": need, "have": have })
	var result: Dictionary = { "complete": complete, "checklist": missing }
	completion_checked.emit(result)
	return result

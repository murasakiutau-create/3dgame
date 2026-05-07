extends Node
class_name RequestManager

const REQUESTS_PATH := "res://data/requests.json"

enum Phase { PLACING, SINGLE_SHOTS, COORDINATE_SHOT, REWARD, IDLE }

signal request_changed(request: Dictionary)
signal phase_changed(phase: int, info: Dictionary)
signal score_recorded(kind: String, payload: Dictionary)
signal reward_ready(payload: Dictionary)

var _all: Array = []
var _current: Dictionary = {}
var _phase: int = Phase.IDLE
var _shots_done: Dictionary = {}    # target_id -> score
var _coord_score: int = 0
var _coord_info: Dictionary = {}
var _completed_ids: Dictionary = {} # ids the player already finished

func _ready() -> void:
	_load()

func _load() -> void:
	var f := FileAccess.open(REQUESTS_PATH, FileAccess.READ)
	if f == null:
		push_error("Requests JSON missing: %s" % REQUESTS_PATH)
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if typeof(parsed) == TYPE_ARRAY:
		_all = parsed

func all_requests() -> Array:
	return _all

func next_pending_request() -> Dictionary:
	for r in _all:
		if not _completed_ids.has(r.get("id", "")):
			return r
	return {}

func start_request(id: String) -> void:
	for r in _all:
		if r.get("id", "") == id:
			_current = r
			_shots_done.clear()
			_coord_score = 0
			_coord_info = {}
			_set_phase(Phase.PLACING)
			request_changed.emit(r)
			return

func current_request() -> Dictionary:
	return _current

func current_phase() -> int:
	return _phase

func is_shot_done(target_id: String) -> bool:
	return _shots_done.has(target_id)

func get_shot_score(target_id: String) -> int:
	return int(_shots_done.get(target_id, 0))

func shots_done_count() -> int:
	return _shots_done.size()

func _set_phase(p: int) -> void:
	_phase = p
	phase_changed.emit(p, _phase_info())

func _phase_info() -> Dictionary:
	return {
		"phase": _phase,
		"shots_done": _shots_done.duplicate(),
		"coord_score": _coord_score,
		"coord_info": _coord_info.duplicate(),
		"targets": _current.get("single_shot_targets", []),
	}

func begin_shoot_phase() -> void:
	if _phase != Phase.PLACING:
		return
	_set_phase(Phase.SINGLE_SHOTS)

## Take a single-item shot. focused_id is the id the camera is currently
## focused on. target_id (optional) is which required target this shot is for;
## if empty, we infer the next un-shot target.
func take_single_shot(focused_id: String) -> Dictionary:
	if _phase != Phase.SINGLE_SHOTS:
		return {}
	var targets: Array = _current.get("single_shot_targets", [])
	# Pick the first unfinished target whose id matches the focused item;
	# otherwise the first unfinished target (camera not on the right thing).
	var target_id: String = ""
	for t in targets:
		var tid: String = t.get("id", "")
		if _shots_done.has(tid):
			continue
		if focused_id == tid:
			target_id = tid
			break
	if target_id == "":
		for t in targets:
			var tid: String = t.get("id", "")
			if not _shots_done.has(tid):
				target_id = tid
				break
	if target_id == "":
		return {}
	var score: int = PhotoEvaluator.score_single(target_id, focused_id, _current)
	_shots_done[target_id] = score
	var payload: Dictionary = {
		"target_id": target_id,
		"focused_id": focused_id,
		"score": score,
		"hit_target": focused_id == target_id,
	}
	score_recorded.emit("single", payload)
	if _shots_done.size() >= targets.size():
		_set_phase(Phase.COORDINATE_SHOT)
	else:
		phase_changed.emit(_phase, _phase_info())
	return payload

func take_coordinate_shot(placement: PlacementController) -> Dictionary:
	if _phase != Phase.COORDINATE_SHOT:
		return {}
	var snap: Array = placement.get_placed_snapshot()
	var info: Dictionary = PhotoEvaluator.score_coordinate(snap, _current)
	_coord_score = int(info.get("score", 0))
	_coord_info = info
	score_recorded.emit("coordinate", info)
	_set_phase(Phase.REWARD)
	var total: int = _total_score()
	reward_ready.emit({
		"single_scores": _shots_done.duplicate(),
		"coord_info": info,
		"total": total,
	})
	return info

func _total_score() -> int:
	var t: int = int(_current.get("base_reward", 0))
	for v in _shots_done.values():
		t += int(v)
	t += _coord_score
	return t

func claim_reward() -> int:
	if _phase != Phase.REWARD:
		return 0
	var total: int = _total_score()
	Wallet.add(total)
	_completed_ids[_current.get("id", "")] = true
	_current = {}
	_shots_done.clear()
	_coord_score = 0
	_coord_info = {}
	_set_phase(Phase.IDLE)
	return total

func cancel() -> void:
	_current = {}
	_shots_done.clear()
	_coord_score = 0
	_coord_info = {}
	_set_phase(Phase.IDLE)

extends CanvasLayer

@export var placement_path: NodePath
@export var request_manager_path: NodePath

@onready var _placement: PlacementController = get_node(placement_path)
@onready var _requests: RequestManager = get_node(request_manager_path)

@onready var _catalog_list: VBoxContainer = $CatalogPanel/Margin/VBox/Scroll/List
@onready var _client_text: RichTextLabel = $ClientPanel/Margin/VBox/Text
@onready var _client_name: Label = $ClientPanel/Margin/VBox/ClientName
@onready var _checklist: VBoxContainer = $ClientPanel/Margin/VBox/Checklist
@onready var _hint: Label = $Hint
@onready var _result_dialog: AcceptDialog = $ResultDialog

func _ready() -> void:
	_populate_catalog()
	_requests.request_changed.connect(_on_request_changed)
	_placement.inventory_changed.connect(_refresh_checklist)
	$HUD/HBox/CompleteBtn.pressed.connect(_on_complete_pressed)
	$HUD/HBox/SaveBtn.pressed.connect(_on_save_pressed)
	$HUD/HBox/LoadBtn.pressed.connect(_on_load_pressed)
	$HUD/HBox/ClearBtn.pressed.connect(_on_clear_pressed)
	if _requests.current_request().size() > 0:
		_on_request_changed(_requests.current_request())

func _populate_catalog() -> void:
	for child in _catalog_list.get_children():
		child.queue_free()
	for entry in Catalog.items:
		var btn := Button.new()
		var size_arr: Array = entry.get("size", [1, 1])
		btn.text = "%s  (%d×%d)" % [entry.get("name", entry.get("id", "?")), size_arr[0], size_arr[1]]
		btn.custom_minimum_size = Vector2(220, 30)
		var id: String = entry.get("id", "")
		btn.pressed.connect(_placement.start_placement.bind(id))
		_catalog_list.add_child(btn)

func _on_request_changed(r: Dictionary) -> void:
	_client_name.text = "依頼主：" + str(r.get("client", "お客さま"))
	_client_text.text = str(r.get("text", ""))
	_refresh_checklist()

func _refresh_checklist() -> void:
	for child in _checklist.get_children():
		child.queue_free()
	var r: Dictionary = _requests.current_request()
	var required: Array = r.get("required", [])
	var counts: Dictionary = _placement.count_placed_by_id()
	for req in required:
		var id: String = req.get("id", "")
		var need: int = int(req.get("min", 1))
		var have: int = int(counts.get(id, 0))
		var lbl := Label.new()
		var mark: String = "✅" if have >= need else "・"
		lbl.text = "%s %s  %d / %d" % [mark, Catalog.get_display_name(id), have, need]
		_checklist.add_child(lbl)

func _on_complete_pressed() -> void:
	var result: Dictionary = _requests.check_completion(_placement)
	if result.get("complete", false):
		_result_dialog.dialog_text = "依頼を達成しました！ お疲れさま。"
		_result_dialog.title = "完成"
	else:
		_result_dialog.dialog_text = "まだ足りない家具があります。チェックリストを確認してね。"
		_result_dialog.title = "もう少し"
	_result_dialog.popup_centered()

func _on_save_pressed() -> void:
	var ok: bool = Save.save_layout(_placement)
	_hint.text = "保存しました" if ok else "保存に失敗しました"

func _on_load_pressed() -> void:
	var ok: bool = Save.load_layout(_placement)
	_hint.text = "読み込みました" if ok else "セーブデータがありません"

func _on_clear_pressed() -> void:
	_placement.clear_all()
	_hint.text = "全て削除しました"

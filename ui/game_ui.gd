extends CanvasLayer

@export var placement_path: NodePath
@export var request_manager_path: NodePath

@onready var _placement: PlacementController = get_node(placement_path)
@onready var _requests: RequestManager = get_node(request_manager_path)

@onready var _gold_label: Label = $TopBar/Margin/HBox/GoldLabel
@onready var _client_btn: Button = $TopBar/Margin/HBox/ClientBtn
@onready var _own_btn: Button = $TopBar/Margin/HBox/OwnBtn
@onready var _shop_btn: Button = $TopBar/Margin/HBox/ShopBtn

@onready var _client_panel: PanelContainer = $ClientPanel
@onready var _client_name: Label = $ClientPanel/Margin/VBox/ClientName
@onready var _client_text: RichTextLabel = $ClientPanel/Margin/VBox/Text
@onready var _phase_header: Label = $ClientPanel/Margin/VBox/PhaseHeader
@onready var _checklist: VBoxContainer = $ClientPanel/Margin/VBox/Checklist
@onready var _action_btn: Button = $ClientPanel/Margin/VBox/ActionBtn

@onready var _catalog_list: VBoxContainer = $CatalogPanel/Margin/VBox/Scroll/List
@onready var _categories_box: HFlowContainer = $CatalogPanel/Margin/VBox/Categories

@onready var _hint: Label = $Hint
@onready var _result_dialog: AcceptDialog = $ResultDialog
@onready var _shop_overlay: Panel = $ShopOverlay
@onready var _shop_gold: Label = $ShopOverlay/Margin/VBox/ShopGold
@onready var _shop_list: VBoxContainer = $ShopOverlay/Margin/VBox/Scroll/List

const CATEGORY_LABELS: Dictionary = {
	"bed": "ベッド",
	"bookshelf": "本棚",
	"rug": "ラグ",
	"lamp": "ランプ",
	"wardrobe": "ワードローブ",
	"chair": "チェア",
	"desk": "デスク",
	"nightstand": "ナイトテーブル"
}
const CATEGORY_ORDER: Array = ["bed", "bookshelf", "rug", "lamp", "wardrobe", "chair", "desk", "nightstand"]

var _current_category: String = ""

func _ready() -> void:
	_populate_categories()
	_populate_catalog()
	_refresh_gold()

	Wallet.gold_changed.connect(func(_g): _refresh_gold())
	Inventory.inventory_changed.connect(_on_inventory_changed)
	GameMode.mode_changed.connect(_on_mode_changed)
	_requests.request_changed.connect(_on_request_changed)
	_requests.phase_changed.connect(_on_phase_changed)
	_requests.score_recorded.connect(_on_score_recorded)
	_requests.reward_ready.connect(_on_reward_ready)

	$HUD/HBox/SaveBtn.pressed.connect(_on_save_pressed)
	$HUD/HBox/LoadBtn.pressed.connect(_on_load_pressed)
	$HUD/HBox/ClearBtn.pressed.connect(_on_clear_pressed)
	$HUD/HBox/ViewBtn.toggled.connect(_on_view_toggled)
	_action_btn.pressed.connect(_on_action_pressed)
	_client_btn.toggled.connect(_on_client_toggled)
	_own_btn.toggled.connect(_on_own_toggled)
	_shop_btn.pressed.connect(_on_shop_pressed)
	$ShopOverlay/Margin/VBox/HeaderBox/CloseBtn.pressed.connect(_close_shop)

	# Default mode is CLIENT_REQUEST so the user lands in a job.
	_client_btn.button_pressed = true
	_enter_client_mode()

# ----------------------------- Mode handling -----------------------------

func _on_client_toggled(active: bool) -> void:
	if active:
		_own_btn.button_pressed = false
		_enter_client_mode()

func _on_own_toggled(active: bool) -> void:
	if active:
		_client_btn.button_pressed = false
		_enter_own_mode()

func _enter_client_mode() -> void:
	if GameMode.is_own():
		Save.save_layout(_placement, "own")
	GameMode.set_mode(GameMode.Mode.CLIENT_REQUEST)
	Save.load_layout(_placement, "client")
	# Start (or resume) the next pending request.
	if _requests.current_request().is_empty():
		var next_r: Dictionary = _requests.next_pending_request()
		if not next_r.is_empty():
			_requests.start_request(next_r.get("id", ""))
	_populate_catalog()
	_refresh_client_panel()

func _enter_own_mode() -> void:
	if GameMode.is_client():
		Save.save_layout(_placement, "client")
	GameMode.set_mode(GameMode.Mode.OWN_ROOM)
	# Cancel any client-side phase.
	_requests.cancel()
	Save.load_layout(_placement, "own")
	_populate_catalog()
	_refresh_client_panel()

func _on_shop_pressed() -> void:
	_shop_overlay.visible = true
	_populate_shop()

func _close_shop() -> void:
	_shop_overlay.visible = false

func _on_mode_changed(_m: int) -> void:
	pass  # individual handlers above handle state

# ----------------------------- Gold -----------------------------

func _refresh_gold() -> void:
	_gold_label.text = "💰 %d G" % Wallet.gold
	_shop_gold.text = "💰 %d G" % Wallet.gold

# ----------------------------- Catalog -----------------------------

func _populate_categories() -> void:
	for child in _categories_box.get_children():
		child.queue_free()
	var all_btn := Button.new()
	all_btn.text = "すべて"
	all_btn.custom_minimum_size = Vector2(0, 28)
	all_btn.pressed.connect(_on_category_pressed.bind(""))
	_categories_box.add_child(all_btn)
	var present: Dictionary = {}
	for entry in Catalog.items:
		present[entry.get("category", "")] = true
	for cat in CATEGORY_ORDER:
		if not present.has(cat):
			continue
		var btn := Button.new()
		btn.text = CATEGORY_LABELS.get(cat, cat)
		btn.custom_minimum_size = Vector2(0, 28)
		btn.pressed.connect(_on_category_pressed.bind(cat))
		_categories_box.add_child(btn)

func _on_category_pressed(cat: String) -> void:
	_current_category = cat
	_populate_catalog()

func _populate_catalog() -> void:
	for child in _catalog_list.get_children():
		child.queue_free()
	var own_only: bool = GameMode.is_own()
	for entry in Catalog.items:
		var cat: String = entry.get("category", "")
		var id: String = entry.get("id", "")
		if _current_category != "" and cat != _current_category:
			continue
		if own_only and not Inventory.is_owned(id):
			continue
		var btn := Button.new()
		btn.text = entry.get("name", id)
		btn.custom_minimum_size = Vector2(220, 30)
		btn.pressed.connect(_placement.start_placement.bind(id))
		_catalog_list.add_child(btn)

func _on_inventory_changed() -> void:
	if GameMode.is_own():
		_populate_catalog()
	if _shop_overlay.visible:
		_populate_shop()

# ----------------------------- Client panel / phases -----------------------------

func _on_request_changed(r: Dictionary) -> void:
	_client_name.text = "依頼主：" + str(r.get("client", "お客さま"))
	_client_text.text = str(r.get("text", ""))
	_refresh_client_panel()

func _on_phase_changed(_phase: int, _info: Dictionary) -> void:
	_refresh_client_panel()
	_apply_phase_view_mode()

func _apply_phase_view_mode() -> void:
	var p: int = _requests.current_phase()
	var should_view: bool = p == RequestManager.Phase.SINGLE_SHOTS or p == RequestManager.Phase.COORDINATE_SHOT
	$HUD/HBox/ViewBtn.button_pressed = should_view
	_placement.set_view_mode(should_view)

func _refresh_client_panel() -> void:
	if not GameMode.is_client():
		_client_panel.visible = false
		return
	_client_panel.visible = true
	for child in _checklist.get_children():
		child.queue_free()
	var r: Dictionary = _requests.current_request()
	if r.is_empty():
		_client_name.text = "今は依頼がありません"
		_client_text.text = "ショップで買い物したり、自分の部屋を整えたりしてみてね"
		_phase_header.text = ""
		_action_btn.visible = false
		return
	_client_name.text = "依頼主：" + str(r.get("client", "お客さま"))
	_client_text.text = str(r.get("text", ""))
	var phase: int = _requests.current_phase()
	var targets: Array = r.get("single_shot_targets", [])
	match phase:
		RequestManager.Phase.PLACING:
			_phase_header.text = "テーマ：%s ／ おすすめ：%s" % [
				str(r.get("theme", "")),
				", ".join(_translate_categories(r.get("preferred_categories", [])))
			]
			for t in targets:
				var lbl := Label.new()
				lbl.text = "📷 撮るもの: %s" % t.get("label", t.get("id", ""))
				_checklist.add_child(lbl)
			_action_btn.visible = true
			_action_btn.text = "撮影開始"
			_action_btn.disabled = false
		RequestManager.Phase.SINGLE_SHOTS:
			var done: int = _requests.shots_done_count()
			_phase_header.text = "📸 単体撮影 %d / %d" % [done, targets.size()]
			for t in targets:
				var tid: String = t.get("id", "")
				var label_txt: String = t.get("label", tid)
				var lbl := Label.new()
				if _requests.is_shot_done(tid):
					lbl.text = "✅ %s  (%d点)" % [label_txt, _requests.get_shot_score(tid)]
				else:
					lbl.text = "・ %s" % label_txt
				_checklist.add_child(lbl)
			_action_btn.visible = true
			_action_btn.text = "📸 撮る"
			_action_btn.disabled = false
		RequestManager.Phase.COORDINATE_SHOT:
			_phase_header.text = "📸 仕上げの一枚"
			var hint := Label.new()
			hint.text = "部屋全体を撮ろう。テーマ：%s" % str(r.get("theme", ""))
			hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			_checklist.add_child(hint)
			_action_btn.visible = true
			_action_btn.text = "📸 撮る"
			_action_btn.disabled = false
		RequestManager.Phase.REWARD:
			_phase_header.text = "撮影完了"
			_action_btn.visible = true
			_action_btn.text = "受け取る"
			_action_btn.disabled = false
		_:
			_phase_header.text = ""
			_action_btn.visible = false

func _translate_categories(cats: Array) -> Array:
	var out: Array = []
	for c in cats:
		out.append(CATEGORY_LABELS.get(c, c))
	return out

func _on_action_pressed() -> void:
	if not GameMode.is_client():
		return
	match _requests.current_phase():
		RequestManager.Phase.PLACING:
			_requests.begin_shoot_phase()
		RequestManager.Phase.SINGLE_SHOTS:
			_requests.take_single_shot(_placement.get_focused_id())
		RequestManager.Phase.COORDINATE_SHOT:
			_requests.take_coordinate_shot(_placement)
		RequestManager.Phase.REWARD:
			var total: int = _requests.claim_reward()
			_hint.text = "報酬 %d G を受け取りました！" % total
			# Auto-load next request if any
			var next_r: Dictionary = _requests.next_pending_request()
			if not next_r.is_empty():
				_placement.clear_all()
				_requests.start_request(next_r.get("id", ""))
			else:
				_refresh_client_panel()
		_:
			pass

func _on_score_recorded(kind: String, payload: Dictionary) -> void:
	if kind == "single":
		var hit: bool = bool(payload.get("hit_target", false))
		var score: int = int(payload.get("score", 0))
		if hit:
			_hint.text = "📸 %d 点！ナイスフレーミング" % score
		else:
			_hint.text = "📸 %d 点 (狙いの家具にズームすると高得点)" % score
	elif kind == "coordinate":
		_hint.text = "📸 コーデ %d 点（テーマ一致 %d / バリエーション %d）" % [
			int(payload.get("score", 0)),
			int(payload.get("theme_matches", 0)),
			int(payload.get("variety", 0))
		]

func _on_reward_ready(payload: Dictionary) -> void:
	var single_lines: Array[String] = []
	var single_scores: Dictionary = payload.get("single_scores", {})
	for tid in single_scores.keys():
		single_lines.append("  %s: %d" % [Catalog.get_display_name(tid), int(single_scores[tid])])
	var coord_info: Dictionary = payload.get("coord_info", {})
	var total: int = int(payload.get("total", 0))
	_result_dialog.title = "📸 撮影終了"
	_result_dialog.dialog_text = (
		"単体撮影:\n%s\n\nコーデ撮影: %d\n\n合計報酬: 💰 %d G"
		% ["\n".join(single_lines), int(coord_info.get("score", 0)), total]
	)
	_result_dialog.popup_centered()

# ----------------------------- HUD buttons -----------------------------

func _on_save_pressed() -> void:
	var slot: String = "client" if GameMode.is_client() else "own"
	var ok: bool = Save.save_layout(_placement, slot)
	_hint.text = "保存しました" if ok else "保存に失敗しました"

func _on_load_pressed() -> void:
	var slot: String = "client" if GameMode.is_client() else "own"
	var ok: bool = Save.load_layout(_placement, slot)
	_hint.text = "読み込みました" if ok else "セーブデータがありません"

func _on_clear_pressed() -> void:
	_placement.clear_all()
	_hint.text = "全て削除しました"

func _on_view_toggled(active: bool) -> void:
	_placement.set_view_mode(active)
	$HUD/HBox/ViewBtn.text = "編集に戻る" if active else "鑑賞モード"
	if not active:
		_hint.text = ""

# ----------------------------- Shop -----------------------------

func _populate_shop() -> void:
	for child in _shop_list.get_children():
		child.queue_free()
	for entry in Catalog.items_for_sale():
		var id: String = entry.get("id", "")
		var name: String = entry.get("name", id)
		var price: int = int(entry.get("price", 0))
		var owned: bool = Inventory.is_owned(id)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.text = "%s   💰 %d G" % [name, price]
		row.add_child(label)
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(80, 28)
		if owned:
			btn.text = "所有済"
			btn.disabled = true
		else:
			btn.text = "買う"
			btn.disabled = not Wallet.can_spend(price)
			btn.pressed.connect(_buy.bind(id, price))
		row.add_child(btn)
		_shop_list.add_child(row)

func _buy(id: String, price: int) -> void:
	if Wallet.spend(price):
		Inventory.unlock(id)
		_populate_shop()
		_hint.text = "購入：%s（残り %d G）" % [Catalog.get_display_name(id), Wallet.gold]

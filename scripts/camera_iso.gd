extends Node3D
class_name CameraIso

@export var zoom_min: float = 6.0
@export var zoom_max: float = 20.0
@export var zoom_step: float = 1.0
@export var rotate_time: float = 0.25
@export var focus_distance: float = 4.0
@export var focus_lift: float = 0.5
@export var focus_time: float = 0.5

@onready var camera: Camera3D = $Camera3D

var _target_yaw: float = 0.0
var _saved_rig_origin: Vector3
var _saved_camera_origin: Vector3
var _is_focused: bool = false

func _ready() -> void:
	_target_yaw = rotation.y
	camera.make_current()
	_saved_rig_origin = global_transform.origin
	_saved_camera_origin = camera.transform.origin

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("camera_rotate_left"):
		_rotate_by(PI / 2.0)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("camera_rotate_right"):
		_rotate_by(-PI / 2.0)
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom(-zoom_step)
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom(zoom_step)
			get_viewport().set_input_as_handled()

func _rotate_by(delta: float) -> void:
	_target_yaw += delta
	var tw := create_tween()
	tw.tween_property(self, "rotation:y", _target_yaw, rotate_time)\
		.set_trans(Tween.TRANS_SINE)\
		.set_ease(Tween.EASE_OUT)

func _zoom(delta: float) -> void:
	camera.size = clamp(camera.size + delta, zoom_min, zoom_max)

## Project a viewport mouse position onto the y=0 plane in world space.
func mouse_to_ground(mouse_pos: Vector2) -> Vector3:
	var from := camera.project_ray_origin(mouse_pos)
	var dir := camera.project_ray_normal(mouse_pos)
	if absf(dir.y) < 0.0001:
		return from
	var t := -from.y / dir.y
	return from + dir * t

## Tween the rig to the target's position and pull the camera in close,
## keeping the iso pitch/yaw so the result is "same angle, zoomed in".
func focus_on(target: Node3D) -> void:
	if not _is_focused:
		_saved_rig_origin = global_transform.origin
		_saved_camera_origin = camera.transform.origin
		_is_focused = true
	var target_origin: Vector3 = target.global_transform.origin
	target_origin.y += focus_lift
	var new_camera_origin: Vector3 = camera.transform.origin
	new_camera_origin.z = focus_distance
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "global_position", target_origin, focus_time)
	tw.tween_property(camera, "position", new_camera_origin, focus_time)

## Tween the rig and camera back to the saved overview pose.
func reset_view() -> void:
	if not _is_focused:
		return
	_is_focused = false
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "global_position", _saved_rig_origin, focus_time)
	tw.tween_property(camera, "position", _saved_camera_origin, focus_time)

func is_focused() -> bool:
	return _is_focused


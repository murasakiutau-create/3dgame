extends Node3D
class_name CameraIso

@export var rotate_time: float = 0.25
@export var focus_distance: float = 4.0
@export var focus_lift: float = 0.5
@export var focus_time: float = 0.5

@export var orbit_yaw_speed: float = 0.006
@export var orbit_pitch_speed: float = 0.006
@export var dist_min: float = 1.2
@export var dist_max: float = 18.0
@export var dist_step: float = 0.6

const PITCH_MIN: float = -PI * 0.5 + 0.05    # almost looking straight down
const PITCH_MAX: float = -0.05               # just above horizontal

@onready var camera: Camera3D = $Camera3D

var _target_yaw: float = 0.0
var _saved_rig_transform: Transform3D
var _saved_camera_transform: Transform3D
var _is_focused: bool = false
var _orbiting: bool = false

func _ready() -> void:
	_target_yaw = rotation.y
	camera.make_current()
	_saved_rig_transform = transform
	_saved_camera_transform = camera.transform

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_MIDDLE:
			_orbiting = mb.pressed
			get_viewport().set_input_as_handled()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_adjust_distance(-dist_step)
			get_viewport().set_input_as_handled()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_adjust_distance(dist_step)
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and _orbiting:
		_orbit((event as InputEventMouseMotion).relative)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("camera_rotate_left"):
		_rotate_by(PI / 2.0)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("camera_rotate_right"):
		_rotate_by(-PI / 2.0)
		get_viewport().set_input_as_handled()

func _rotate_by(delta: float) -> void:
	_target_yaw += delta
	var tw := create_tween()
	tw.tween_property(self, "rotation:y", _target_yaw, rotate_time)\
		.set_trans(Tween.TRANS_SINE)\
		.set_ease(Tween.EASE_OUT)

func _orbit(delta: Vector2) -> void:
	rotation.y -= delta.x * orbit_yaw_speed
	rotation.x = clamp(rotation.x - delta.y * orbit_pitch_speed, PITCH_MIN, PITCH_MAX)
	_target_yaw = rotation.y

func _adjust_distance(delta: float) -> void:
	var p: Vector3 = camera.position
	p.z = clamp(p.z + delta, dist_min, dist_max)
	camera.position = p

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
		_saved_rig_transform = transform
		_saved_camera_transform = camera.transform
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
	tw.tween_property(self, "transform", _saved_rig_transform, focus_time)
	tw.tween_property(camera, "transform", _saved_camera_transform, focus_time)
	_target_yaw = _saved_rig_transform.basis.get_euler().y

func is_focused() -> bool:
	return _is_focused

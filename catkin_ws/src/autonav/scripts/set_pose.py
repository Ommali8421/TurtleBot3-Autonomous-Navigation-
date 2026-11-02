#!/usr/bin/env python3
"""
Node: set_pose
Description: Teleports and synchronizes TurtleBot3 position across:
             1. Gazebo 3D physics (/gazebo/set_model_state)
             2. AMCL / RViz 2D localization (/initialpose)
             3. move_base costmaps (/move_base/clear_costmaps)
Usage:
    rosrun autonav set_pose.py <X> <Y> [YAW_DEGREES_OR_RADIANS]
    rosrun autonav set_pose.py -2.0 -0.5 0.0   # Default Gazebo spawn
    rosrun autonav set_pose.py  0.0  0.0 0.0   # Center of arena
    rosrun autonav set_pose.py  1.5  1.5 90    # Top-right corridor
"""

import sys
import math
import rospy
from geometry_msgs.msg import PoseWithCovarianceStamped, Quaternion
from std_srvs.srv import Empty

try:
    from gazebo_msgs.srv import SetModelState
    from gazebo_msgs.msg import ModelState
    HAS_GAZEBO = True
except ImportError:
    HAS_GAZEBO = False


def yaw_to_quaternion(yaw_rad):
    """Converts a planar yaw angle in radians to a geometry_msgs/Quaternion."""
    q = Quaternion()
    q.x = 0.0
    q.y = 0.0
    q.z = math.sin(yaw_rad / 2.0)
    q.w = math.cos(yaw_rad / 2.0)
    return q


def set_robot_pose(x=-2.0, y=-0.5, yaw_rad=0.0):
    rospy.init_node('set_pose', anonymous=False)

    q = yaw_to_quaternion(yaw_rad)
    yaw_deg = math.degrees(yaw_rad)

    rospy.loginfo("=" * 65)
    rospy.loginfo("         TURTLEBOT 3 POSE SYNCHRONIZER & TELEPORTER")
    rospy.loginfo("=" * 65)
    rospy.loginfo("  Target Position:    X = %.3f m,  Y = %.3f m", x, y)
    rospy.loginfo("  Target Orientation: Yaw = %.1f deg (%.3f rad)", yaw_deg, yaw_rad)
    rospy.loginfo("-" * 65)

    # ─── 1. Update Gazebo Simulation ───
    if HAS_GAZEBO:
        try:
            rospy.loginfo("  [1/3] Updating Gazebo Simulation (/gazebo/set_model_state)...")
            rospy.wait_for_service('/gazebo/set_model_state', timeout=3.0)
            set_state = rospy.ServiceProxy('/gazebo/set_model_state', SetModelState)

            state = ModelState()
            state.reference_frame = 'world'
            state.pose.position.x = x
            state.pose.position.y = y
            state.pose.position.z = 0.01
            state.pose.orientation = q
            state.twist.linear.x = 0.0
            state.twist.linear.y = 0.0
            state.twist.linear.z = 0.0
            state.twist.angular.x = 0.0
            state.twist.angular.y = 0.0
            state.twist.angular.z = 0.0

            candidates = ['turtlebot3_burger', 'turtlebot3_waffle', 'turtlebot3_waffle_pi', 'turtlebot3', 'robot']
            teleported = False
            for c_name in candidates:
                state.model_name = c_name
                res = set_state(state)
                if res.success:
                    rospy.loginfo("        [OK] Gazebo robot ('%s') teleported successfully.", c_name)
                    teleported = True
                    break
            if not teleported:
                rospy.logwarn("        [WARN] Gazebo reported: %s", res.status_message)
        except Exception as e:
            rospy.logwarn("        [INFO] Gazebo service not reachable (%s). Skipping Gazebo update.", str(e))
    else:
        rospy.loginfo("  [1/3] Gazebo messages not installed. Skipping Gazebo state update.")

    # ─── 2. Update AMCL / RViz Localization ───
    rospy.loginfo("  [2/3] Synchronizing AMCL Localization (/initialpose)...")
    init_pub = rospy.Publisher('/initialpose', PoseWithCovarianceStamped, queue_size=10, latch=True)

    msg = PoseWithCovarianceStamped()
    msg.header.stamp = rospy.Time.now()
    msg.header.frame_id = 'map'
    msg.pose.pose.position.x = x
    msg.pose.pose.position.y = y
    msg.pose.pose.position.z = 0.0
    msg.pose.pose.orientation = q

    # Tight covariance: high certainty forces particles to snap immediately around (x, y)
    cov = [0.0] * 36
    cov[0] = 0.04   # Var(X)
    cov[7] = 0.04   # Var(Y)
    cov[35] = 0.03  # Var(Yaw)
    msg.pose.covariance = cov

    # Wait for AMCL connection
    wait_rate = rospy.Rate(10)
    attempts = 0
    while not rospy.is_shutdown() and init_pub.get_num_connections() == 0 and attempts < 15:
        attempts += 1
        wait_rate.sleep()

    # Publish multiple times to flush filter
    for _ in range(5):
        if rospy.is_shutdown():
            break
        msg.header.stamp = rospy.Time.now()
        init_pub.publish(msg)
        rospy.sleep(0.10)

    rospy.loginfo("        [OK] AMCL /initialpose published (RViz particles snapped to pose).")

    # ─── 3. Clear Costmaps in move_base ───
    rospy.loginfo("  [3/3] Clearing move_base Costmaps (/move_base/clear_costmaps)...")
    try:
        rospy.wait_for_service('/move_base/clear_costmaps', timeout=2.0)
        clear_srv = rospy.ServiceProxy('/move_base/clear_costmaps', Empty)
        clear_srv()
        rospy.loginfo("        [OK] Costmaps refreshed cleanly around new location.")
    except Exception:
        rospy.loginfo("        [INFO] move_base clear service not active. Continuing.")

    rospy.loginfo("=" * 65)
    rospy.loginfo("  SYNCHRONIZATION COMPLETE! Gazebo and RViz are now at (%.2f, %.2f).", x, y)
    rospy.loginfo("=" * 65)


if __name__ == '__main__':
    # Parse CLI arguments
    target_x = -2.0
    target_y = -0.5
    target_yaw = 0.0

    if len(sys.argv) >= 2:
        try:
            target_x = float(sys.argv[1])
        except ValueError:
            pass

    if len(sys.argv) >= 3:
        try:
            target_y = float(sys.argv[2])
        except ValueError:
            pass

    if len(sys.argv) >= 4:
        try:
            val = float(sys.argv[3])
            # If user entered large number (e.g. 90, 180), treat as degrees
            if abs(val) > math.pi:
                target_yaw = math.radians(val)
            else:
                target_yaw = val
        except ValueError:
            pass

    try:
        set_robot_pose(target_x, target_y, target_yaw)
    except rospy.ROSInterruptException:
        pass

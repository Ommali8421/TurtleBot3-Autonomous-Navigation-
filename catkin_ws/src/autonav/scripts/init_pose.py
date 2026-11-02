#!/usr/bin/env python3
"""
Node: init_pose
Description: Programmatically synchronizes AMCL localization with Gazebo reality
             by reading the robot's ground truth pose from Gazebo (/gazebo/model_states)
             or offsetting /odom by the Gazebo spawn position (-2.0, -0.5),
             then publishing to '/initialpose' (geometry_msgs/PoseWithCovarianceStamped).
Package: autonav
Target: ROS 1 Melodic / Noetic (TurtleBot3 Burger)
"""

import sys
import rospy
from geometry_msgs.msg import PoseWithCovarianceStamped
from nav_msgs.msg import Odometry

try:
    from gazebo_msgs.msg import ModelStates
    HAS_GAZEBO_MSGS = True
except ImportError:
    HAS_GAZEBO_MSGS = False


def publish_initial_pose():
    # 1. Initialize ROS Node
    rospy.init_node('init_pose', anonymous=False)
    rospy.loginfo("[init_pose] Node initialized. Synchronizing AMCL localization with Gazebo...")

    # Check CLI arguments for custom override: rosrun autonav init_pose.py <X> <Y> <W>
    custom_x = None
    custom_y = None
    custom_w = 1.0

    if len(sys.argv) >= 3:
        try:
            custom_x = float(sys.argv[1])
            custom_y = float(sys.argv[2])
            if len(sys.argv) >= 4:
                custom_w = float(sys.argv[3])
            rospy.loginfo("[init_pose] Custom initial pose provided via CLI: (x=%.2f, y=%.2f, w=%.2f)",
                          custom_x, custom_y, custom_w)
        except ValueError:
            custom_x = None

    # Setup Publisher to /initialpose
    init_pose_pub = rospy.Publisher('/initialpose', PoseWithCovarianceStamped, queue_size=10, latch=True)

    posX = -2.0
    posY = -0.5
    posZ = 0.0
    orientX = 0.0
    orientY = 0.0
    orientZ = 0.0
    orientW = 1.0

    if custom_x is not None:
        posX = custom_x
        posY = custom_y
        orientW = custom_w
    else:
        # Try retrieving ground truth directly from Gazebo
        found_gazebo = False
        if HAS_GAZEBO_MSGS:
            try:
                rospy.loginfo("[init_pose] Querying /gazebo/model_states for ground-truth pose...")
                model_states = rospy.wait_for_message('/gazebo/model_states', ModelStates, timeout=2.0)
                if 'turtlebot3_burger' in model_states.name:
                    idx = model_states.name.index('turtlebot3_burger')
                    p = model_states.pose[idx]
                    posX = p.position.x
                    posY = p.position.y
                    posZ = p.position.z
                    orientX = p.orientation.x
                    orientY = p.orientation.y
                    orientZ = p.orientation.z
                    orientW = p.orientation.w
                    found_gazebo = True
                    rospy.loginfo("[init_pose] Successfully retrieved ground truth from Gazebo: (x=%.3f, y=%.3f)", posX, posY)
            except rospy.ROSException:
                rospy.loginfo("[init_pose] /gazebo/model_states not immediately available. Falling back...")

        # If Gazebo topic not available, retrieve /odom and apply spawn offset (-2.0, -0.5)
        if not found_gazebo:
            try:
                rospy.loginfo("[init_pose] Listening to /odom...")
                odom_msg = rospy.wait_for_message('/odom', Odometry, timeout=3.0)
                # In Gazebo, /odom starts at (0, 0) relative to spawn point (-2.0, -0.5)
                # Therefore map_x = spawn_x + odom_x
                posX = -2.0 + odom_msg.pose.pose.position.x
                posY = -0.5 + odom_msg.pose.pose.position.y
                orientX = odom_msg.pose.pose.orientation.x
                orientY = odom_msg.pose.pose.orientation.y
                orientZ = odom_msg.pose.pose.orientation.z
                orientW = odom_msg.pose.pose.orientation.w
                rospy.loginfo("[init_pose] Synchronized using /odom + spawn offset (-2.0, -0.5): (x=%.3f, y=%.3f)", posX, posY)
            except rospy.ROSException:
                rospy.loginfo("[init_pose] Using default Gazebo spawn position: (x=-2.0, y=-0.5, w=1.0)")
                posX = -2.0
                posY = -0.5

    # 4. Construct PoseWithCovarianceStamped message
    init_pose = PoseWithCovarianceStamped()
    init_pose.header.stamp = rospy.Time.now()
    init_pose.header.frame_id = "map"  # AMCL requires coordinates in the 'map' frame

    init_pose.pose.pose.position.x = posX
    init_pose.pose.pose.position.y = posY
    init_pose.pose.pose.position.z = posZ

    init_pose.pose.pose.orientation.x = orientX
    init_pose.pose.pose.orientation.y = orientY
    init_pose.pose.pose.orientation.z = orientZ
    init_pose.pose.pose.orientation.w = orientW if orientW != 0.0 else 1.0

    # Covariance matrix (high confidence for initial convergence)
    covariance = [0.0] * 36
    covariance[0] = 0.05   # x variance (small for sharp particle convergence)
    covariance[7] = 0.05   # y variance
    covariance[35] = 0.05  # yaw variance
    init_pose.pose.covariance = covariance

    # 5. Wait for AMCL subscriber to connect before publishing
    rospy.loginfo("[init_pose] Publishing initial pose to AMCL (/initialpose):")
    rospy.loginfo("             Position:    (x=%.3f, y=%.3f, z=%.3f)", posX, posY, posZ)
    rospy.loginfo("             Orientation: (x=%.3f, y=%.3f, z=%.3f, w=%.3f)",
                  init_pose.pose.pose.orientation.x,
                  init_pose.pose.pose.orientation.y,
                  init_pose.pose.pose.orientation.z,
                  init_pose.pose.pose.orientation.w)

    wait_rate = rospy.Rate(5)
    attempts = 0
    while not rospy.is_shutdown() and init_pose_pub.get_num_connections() == 0 and attempts < 25:
        attempts += 1
        wait_rate.sleep()

    # Publish multiple times to ensure AMCL particle filter collapses around the true pose
    for _ in range(5):
        if rospy.is_shutdown():
            break
        init_pose.header.stamp = rospy.Time.now()
        init_pose_pub.publish(init_pose)
        rospy.sleep(0.15)

    rospy.loginfo("[init_pose] AMCL localization successfully synchronized at (x=%.2f, y=%.2f)!", posX, posY)


if __name__ == '__main__':
    try:
        publish_initial_pose()
    except rospy.ROSInterruptException:
        pass

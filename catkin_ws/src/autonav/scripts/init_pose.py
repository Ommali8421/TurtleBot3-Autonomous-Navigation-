#!/usr/bin/env python3
"""
Node: init_pose
Description: Programmatically synchronizes AMCL localization with Gazebo reality
             by reading the robot's actual initial pose from '/odom' (or Gazebo ground truth)
             and publishing it to the '/initialpose' topic.
Package: autonav
Target: ROS 1 Melodic / Noetic (TurtleBot3 Burger)
"""

import sys
import rospy
from geometry_msgs.msg import PoseWithCovarianceStamped
from nav_msgs.msg import Odometry


def publish_initial_pose():
    # 1. Initialize ROS Node
    rospy.init_node('init_pose', anonymous=False)
    rospy.loginfo("[init_pose] Node initialized. Waiting for /odom to retrieve robot pose...")

    # 2. Setup Publisher to /initialpose
    # AMCL subscribes to /initialpose (geometry_msgs/PoseWithCovarianceStamped)
    init_pose_pub = rospy.Publisher('/initialpose', PoseWithCovarianceStamped, queue_size=10, latch=True)

    # 3. Robustly listen to /odom topic until received or shutdown
    odom_msg = None
    rate = rospy.Rate(2)  # Check every 0.5s
    while not rospy.is_shutdown() and odom_msg is None:
        try:
            odom_msg = rospy.wait_for_message('/odom', Odometry, timeout=3.0)
            rospy.loginfo("[init_pose] Successfully received initial odometry from /odom.")
        except rospy.ROSException:
            rospy.loginfo("[init_pose] Still waiting for /odom topic from Gazebo...")

    if rospy.is_shutdown() or odom_msg is None:
        rospy.logwarn("[init_pose] Shutdown requested before receiving /odom message. Exiting.")
        return

    # 4. Construct PoseWithCovarianceStamped message
    init_pose = PoseWithCovarianceStamped()

    # Header configuration
    init_pose.header.stamp = rospy.Time.now()
    init_pose.header.frame_id = "map"  # AMCL expects coordinates in the 'map' frame

    # Extract Position from Odometry
    init_pose.pose.pose.position.x = odom_msg.pose.pose.position.x
    init_pose.pose.pose.position.y = odom_msg.pose.pose.position.y
    init_pose.pose.pose.position.z = odom_msg.pose.pose.position.z

    # Extract Orientation from Odometry
    init_pose.pose.pose.orientation.x = odom_msg.pose.pose.orientation.x
    init_pose.pose.pose.orientation.y = odom_msg.pose.pose.orientation.y
    init_pose.pose.pose.orientation.z = odom_msg.pose.pose.orientation.z
    init_pose.pose.pose.orientation.w = odom_msg.pose.pose.orientation.w

    # Ensure quaternion is non-zero / valid
    if (init_pose.pose.pose.orientation.x == 0.0 and
        init_pose.pose.pose.orientation.y == 0.0 and
        init_pose.pose.pose.orientation.z == 0.0 and
        init_pose.pose.pose.orientation.w == 0.0):
        init_pose.pose.pose.orientation.w = 1.0

    # Populate Covariance matrix (6x6 covariance represented as a 36-element list)
    # Small non-zero variances indicate high initial confidence to AMCL particle filter
    covariance = [0.0] * 36
    covariance[0] = 0.25   # Covariance x
    covariance[7] = 0.25   # Covariance y
    covariance[35] = 0.068 # Covariance yaw (approx (pi/12)^2)
    init_pose.pose.covariance = covariance

    # Log the captured pose
    rospy.loginfo("[init_pose] Synchronizing AMCL initial pose:")
    rospy.loginfo("             Position:    (x=%.3f, y=%.3f, z=%.3f)",
                  init_pose.pose.pose.position.x,
                  init_pose.pose.pose.position.y,
                  init_pose.pose.pose.position.z)
    rospy.loginfo("             Orientation: (x=%.3f, y=%.3f, z=%.3f, w=%.3f)",
                  init_pose.pose.pose.orientation.x,
                  init_pose.pose.pose.orientation.y,
                  init_pose.pose.pose.orientation.z,
                  init_pose.pose.pose.orientation.w)

    # 5. Wait for AMCL subscriber to connect before publishing
    rospy.loginfo("[init_pose] Waiting for subscribers on /initialpose...")
    wait_rate = rospy.Rate(5)  # 5 Hz
    attempts = 0
    max_attempts = 30  # 6 seconds wait

    while not rospy.is_shutdown() and init_pose_pub.get_num_connections() == 0 and attempts < max_attempts:
        attempts += 1
        wait_rate.sleep()

    if init_pose_pub.get_num_connections() == 0:
        rospy.logwarn("[init_pose] No active subscribers detected on /initialpose. Publishing anyway (latched)...")

    # Publish several times with updated timestamp to ensure AMCL particle cloud is initialized
    for _ in range(3):
        if rospy.is_shutdown():
            break
        init_pose.header.stamp = rospy.Time.now()
        init_pose_pub.publish(init_pose)
        rospy.sleep(0.2)

    rospy.loginfo("[init_pose] Initial pose successfully published to /initialpose!")

    # Allow network buffer flush before node termination
    rospy.sleep(1.0)
    rospy.loginfo("[init_pose] AMCL localization synchronization complete.")


if __name__ == '__main__':
    try:
        publish_initial_pose()
    except rospy.ROSInterruptException:
        rospy.loginfo("[init_pose] Node interrupted before completion.")

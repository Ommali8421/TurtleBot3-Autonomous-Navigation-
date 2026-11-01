#!/usr/bin/env python3
"""
Node: goal_pose
Description: Sends target navigation goals to the move_base action server
             for autonomous navigation of TurtleBot3.
             Implements active, feedback, and done callbacks with complete status handling.
Package: autonav
Target: ROS 1 Melodic / Noetic (TurtleBot3 Burger)
"""

import sys
import rospy
import actionlib
from move_base_msgs.msg import MoveBaseAction, MoveBaseGoal
from actionlib_msgs.msg import GoalStatus


class MoveBaseClient:
    """Action client wrapper for move_base navigation."""

    def __init__(self):
        # 1. Initialize ROS Node
        rospy.init_node('goal_pose', anonymous=False)
        rospy.loginfo("[goal_pose] Initializing goal_pose node...")

        # 2. Create SimpleActionClient for move_base action server
        self.client = actionlib.SimpleActionClient('move_base', MoveBaseAction)

        # Register shutdown hook to cancel active goals and halt robot if interrupted
        rospy.on_shutdown(self.cancel_goal)

        # 3. Wait for the action server to become available (responsive to Ctrl+C)
        rospy.loginfo("[goal_pose] Waiting for 'move_base' action server to start...")
        connected = False
        while not rospy.is_shutdown() and not connected:
            connected = self.client.wait_for_server(rospy.Duration(2.0))
            if not connected:
                rospy.loginfo("[goal_pose] Still waiting for 'move_base' action server...")

        if not connected:
            rospy.logwarn("[goal_pose] Node shutdown before 'move_base' action server became available.")
            return

        rospy.loginfo("[goal_pose] Successfully connected to 'move_base' action server.")

        # Rate limiter for feedback logging
        self.last_feedback_time = rospy.Time.now()

    def cancel_goal(self):
        """Shutdown hook: ensure robot stops if node is interrupted."""
        rospy.logwarn("[goal_pose] Node shutting down. Canceling active navigation goal...")
        try:
            self.client.cancel_goal()
        except Exception:
            pass

    def active_callback(self):
        """Callback invoked once when the goal is accepted and active on move_base."""
        rospy.loginfo("[goal_pose] [ACTIVE CALLBACK] Goal has been received and is currently being processed by move_base.")

    def feedback_callback(self, feedback):
        """Callback invoked periodically by move_base while navigating."""
        current_time = rospy.Time.now()
        # Throttle feedback logging to once every 2 seconds to avoid console clutter
        if (current_time - self.last_feedback_time).to_sec() >= 2.0:
            self.last_feedback_time = current_time
            current_x = feedback.base_position.pose.position.x
            current_y = feedback.base_position.pose.position.y
            rospy.loginfo("[goal_pose] [FEEDBACK] Current Robot Position: (x=%.2f, y=%.2f)", current_x, current_y)

    def done_callback(self, status, result):
        """
        Callback invoked when the action server finishes processing the goal.
        Status codes (actionlib_msgs/GoalStatus):
          0: PENDING
          1: ACTIVE
          2: PREEMPTED
          3: SUCCEEDED
          4: ABORTED
          5: REJECTED
          6: PREEMPTING
          7: RECALLING
          8: RECALLED
          9: LOST
        """
        status_descriptions = {
            GoalStatus.PENDING: "PENDING (Goal not yet processed)",
            GoalStatus.ACTIVE: "ACTIVE (Goal is currently active)",
            GoalStatus.PREEMPTED: "PREEMPTED (Goal canceled by user/another goal)",
            GoalStatus.SUCCEEDED: "SUCCEEDED (Goal target successfully reached!)",
            GoalStatus.ABORTED: "ABORTED (Goal aborted by server - path blocked or unreachable)",
            GoalStatus.REJECTED: "REJECTED (Goal rejected by action server)",
            GoalStatus.PREEMPTING: "PREEMPTING (Goal cancellation in progress)",
            GoalStatus.RECALLING: "RECALLING (Goal recall in progress)",
            GoalStatus.RECALLED: "RECALLED (Goal successfully recalled)",
            GoalStatus.LOST: "LOST (Goal connection lost)"
        }

        desc = status_descriptions.get(status, f"UNKNOWN STATUS CODE ({status})")

        # Specifically check if status equals 3 for successful goal completion
        if status == 3:  # GoalStatus.SUCCEEDED
            rospy.loginfo("=" * 60)
            rospy.loginfo("[goal_pose] [DONE CALLBACK] Status %d: %s", status, desc)
            rospy.loginfo("[goal_pose] SUCCESS: TurtleBot3 has reached the navigation goal!")
            rospy.loginfo("=" * 60)
        else:
            rospy.logwarn("=" * 60)
            rospy.logwarn("[goal_pose] [DONE CALLBACK] Status %d: %s", status, desc)
            rospy.logwarn("[goal_pose] WARNING: Navigation did not complete successfully.")
            rospy.logwarn("=" * 60)

    def send_navigation_goal(self, target_x=2.0, target_y=0.5, target_w=1.0):
        """Constructs and dispatches the MoveBaseGoal to the action server."""
        if rospy.is_shutdown():
            return None

        goal = MoveBaseGoal()

        # Goal header: set frame_id to 'map'
        goal.target_pose.header.frame_id = "map"
        goal.target_pose.header.stamp = rospy.Time.now()

        # Target Coordinates
        goal.target_pose.pose.position.x = float(target_x)
        goal.target_pose.pose.position.y = float(target_y)
        goal.target_pose.pose.position.z = 0.0

        # Target Orientation (Quaternion: planar yaw facing angle)
        goal.target_pose.pose.orientation.x = 0.0
        goal.target_pose.pose.orientation.y = 0.0
        goal.target_pose.pose.orientation.z = 0.0
        goal.target_pose.pose.orientation.w = float(target_w)

        # Ensure quaternion is valid and normalized
        if (goal.target_pose.pose.orientation.x == 0.0 and
            goal.target_pose.pose.orientation.y == 0.0 and
            goal.target_pose.pose.orientation.z == 0.0 and
            goal.target_pose.pose.orientation.w == 0.0):
            goal.target_pose.pose.orientation.w = 1.0

        rospy.loginfo("=" * 60)
        rospy.loginfo("[goal_pose] Sending target goal:")
        rospy.loginfo("             Frame:       %s", goal.target_pose.header.frame_id)
        rospy.loginfo("             Target (x,y): (%.2f, %.2f)", float(target_x), float(target_y))
        rospy.loginfo("             Orientation: w=%.2f", float(target_w))
        rospy.loginfo("=" * 60)

        # Dispatch goal with active, feedback, and done callbacks
        self.client.send_goal(
            goal,
            done_cb=self.done_callback,
            active_cb=self.active_callback,
            feedback_cb=self.feedback_callback
        )

        # Non-blocking wait for result that responds immediately to Ctrl+C (SIGINT)
        rate = rospy.Rate(10)
        while not rospy.is_shutdown():
            # Check with a 0.2s slice
            if self.client.wait_for_result(rospy.Duration(0.2)):
                break
            rate.sleep()

        return self.client.get_state()


def parse_arguments():
    """Parses coordinates from CLI arguments or ROS parameters."""
    target_x = 0.0
    target_y = 0.0
    target_w = 0.0

    # 1. Filter out ROS internal remapping arguments (e.g., __name:=..., __log:=...)
    user_args = [arg for arg in sys.argv[1:] if not arg.startswith('__') and not arg.startswith('_')]

    if len(user_args) >= 3:
        try:
            target_x = float(user_args[0])
            target_y = float(user_args[1])
            target_w = float(user_args[2])
        except ValueError:
            rospy.logwarn("[goal_pose] Invalid CLI arguments provided. Falling back to default/parameters.")
    elif len(user_args) == 2:
        try:
            target_x = float(user_args[0])
            target_y = float(user_args[1])
        except ValueError:
            pass

    # 2. Check ROS parameter overrides (e.g., _goal_x:=... or param tags)
    target_x = float(rospy.get_param('~goal_x', target_x))
    target_y = float(rospy.get_param('~goal_y', target_y))
    target_w = float(rospy.get_param('~goal_w', target_w))

    return target_x, target_y, target_w


def main():
    try:
        navigator = MoveBaseClient()
        if rospy.is_shutdown():
            return

        target_x, target_y, target_w = parse_arguments()
        navigator.send_navigation_goal(target_x, target_y, target_w)

    except rospy.ROSInterruptException:
        rospy.loginfo("[goal_pose] Node interrupted before goal reached.")


if __name__ == '__main__':
    main()

cmake_minimum_required(VERSION 3.0.2)
project(autonav)

## Find catkin macros and libraries
find_package(catkin REQUIRED COMPONENTS
  rospy
  geometry_msgs
  nav_msgs
  actionlib
  move_base_msgs
  actionlib_msgs
)

###################################
## catkin specific configuration ##
###################################
catkin_package(
  CATKIN_DEPENDS
    rospy
    geometry_msgs
    nav_msgs
    actionlib
    move_base_msgs
    actionlib_msgs
)

###########
## Build ##
###########
include_directories(
  ${catkin_INCLUDE_DIRS}
)

#############
## Install ##
#############
# Mark executable Python scripts for installation
catkin_install_python(PROGRAMS
  scripts/init_pose.py
  scripts/goal_pose.py
  scripts/set_pose.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)

# Install launch files and parameter files
install(DIRECTORY launch/
  DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}/launch
)
install(DIRECTORY param/
  DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}/param
)

/**
 * ROSBridge WebSocket Connector (roslibjs)
 * Synchronizes the 3D Web Simulator live with real ROS Melodic / Noetic:
 * - Subscribes to /gazebo/model_states (100% ground-truth physics sync from Gazebo)
 * - Subscribes to /amcl_pose (the localized map-frame pose from RViz)
 * - Subscribes to /move_base/feedback (real-time trajectory updates during navigation)
 * - Subscribes to /cmd_vel (drives wheel animations and speed telemetries)
 * - Subscribes to /move_base_simple/goal & /move_base/current_goal (mirrors RViz goals)
 * - Auto-reconnection logic so it links automatically as soon as ROS starts
 */

class ROSBridge {
  constructor(options = {}) {
    this.url = options.url || 'ws://localhost:9090';
    this.ros = null;
    this.connected = false;
    this.autoReconnect = true;
    this.retryTimer = null;

    // Subscriptions & Publishers
    this.gazeboSub = null;
    this.amclSub = null;
    this.feedbackSub = null;
    this.odomSub = null;
    this.cmdVelSub = null;
    this.goalSub = null;
    this.goalPub = null;

    // Event hooks
    this.onConnectionChange = null;
    this.onPoseReceived = null;
    this.onCmdVelReceived = null;
    this.onGoalReceived = null;
  }

  connect(customUrl = null) {
    if (customUrl) this.url = customUrl;
    this.autoReconnect = true;

    if (typeof ROSLIB === 'undefined') {
      console.warn('[ROSBridge] ROSLIB not found. Live ROS sync disabled.');
      return;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    try {
      if (this.ros) {
        this.ros.close();
      }

      this.ros = new ROSLIB.Ros({ url: this.url });

      this.ros.on('connection', () => {
        this.connected = true;
        console.log('[ROSBridge] Successfully connected to ROS at:', this.url);
        this.setupTopics();
        if (this.onConnectionChange) this.onConnectionChange(true, 'Connected to ROS (' + this.url + ')');
      });

      this.ros.on('error', (err) => {
        this.connected = false;
        if (this.onConnectionChange) this.onConnectionChange(false, 'Connecting to ROS...');
        this.scheduleReconnect();
      });

      this.ros.on('close', () => {
        this.connected = false;
        if (this.onConnectionChange) this.onConnectionChange(false, 'Waiting for ROS...');
        this.scheduleReconnect();
      });
    } catch (e) {
      console.warn('[ROSBridge] Exception starting WebSocket:', e);
      if (this.onConnectionChange) this.onConnectionChange(false, 'Standalone Mode');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (!this.autoReconnect || this.connected) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);

    this.retryTimer = setTimeout(() => {
      if (this.autoReconnect && !this.connected) {
        console.log('[ROSBridge] Attempting to reconnect to ROS...');
        this.connect();
      }
    }, 2500);
  }

  disconnect() {
    this.autoReconnect = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ros) {
      this.ros.close();
      this.connected = false;
    }
    if (this.onConnectionChange) this.onConnectionChange(false, 'Standalone Mode');
  }

  setupTopics() {
    if (!this.ros) return;

    // Helper: Extract yaw from quaternion
    const extractYaw = (orient) => {
      const siny_cosp = 2 * (orient.w * orient.z + orient.x * orient.y);
      const cosy_cosp = 1 - 2 * (orient.y * orient.y + orient.z * orient.z);
      return Math.atan2(siny_cosp, cosy_cosp);
    };

    // ─── 1. Subscribe to /gazebo/model_states (100% Ground Truth from Gazebo Simulation) ───
    this.gazeboSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/gazebo/model_states',
      messageType: 'gazebo_msgs/ModelStates'
    });

    this.gazeboSub.subscribe((msg) => {
      if (!msg.name || !msg.pose) return;
      let idx = msg.name.indexOf('turtlebot3_burger');
      if (idx === -1) {
        idx = msg.name.findIndex(n => n.includes('turtlebot') || n.includes('burger'));
      }

      if (idx !== -1 && msg.pose[idx]) {
        const p = msg.pose[idx].position;
        const yaw = extractYaw(msg.pose[idx].orientation);
        if (this.onPoseReceived) {
          this.onPoseReceived(p.x, p.y, yaw, 'gazebo');
        }
      }
    });

    // ─── 2. Subscribe to /amcl_pose (The exact pose rendered in RViz) ───
    this.amclSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/amcl_pose',
      messageType: 'geometry_msgs/PoseWithCovarianceStamped'
    });

    this.amclSub.subscribe((msg) => {
      const pos = msg.pose.pose.position;
      const yaw = extractYaw(msg.pose.pose.orientation);
      if (this.onPoseReceived) {
        this.onPoseReceived(pos.x, pos.y, yaw, 'amcl');
      }
    });

    // ─── 3. Subscribe to /move_base/feedback (Real-time tracking from planner) ───
    this.feedbackSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/move_base/feedback',
      messageType: 'move_base_msgs/MoveBaseActionFeedback'
    });

    this.feedbackSub.subscribe((msg) => {
      const pos = msg.feedback.base_position.pose.position;
      const yaw = extractYaw(msg.feedback.base_position.pose.orientation);
      if (this.onPoseReceived) {
        this.onPoseReceived(pos.x, pos.y, yaw, 'feedback');
      }
    });

    // ─── 4. Subscribe to /odom (Continuous odometry fallback) ───
    this.odomSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/odom',
      messageType: 'nav_msgs/Odometry'
    });

    this.odomSub.subscribe((msg) => {
      const pos = msg.pose.pose.position;
      const yaw = extractYaw(msg.pose.pose.orientation);
      if (this.onPoseReceived) {
        this.onPoseReceived(pos.x, pos.y, yaw, 'odom');
      }
    });

    // ─── 5. Subscribe to /cmd_vel (For wheel rotation speed) ───
    this.cmdVelSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/cmd_vel',
      messageType: 'geometry_msgs/Twist'
    });

    this.cmdVelSub.subscribe((msg) => {
      if (this.onCmdVelReceived) {
        this.onCmdVelReceived(msg.linear.x, msg.angular.z);
      }
    });

    // ─── 6. Subscribe to /move_base_simple/goal (Mirror RViz 2D Nav Goal beacon) ───
    this.goalSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/move_base_simple/goal',
      messageType: 'geometry_msgs/PoseStamped'
    });

    this.goalSub.subscribe((msg) => {
      const pos = msg.pose.position;
      const w = msg.pose.orientation.w;
      if (this.onGoalReceived) {
        this.onGoalReceived(pos.x, pos.y, w);
      }
    });

    // ─── 7. Publisher for /move_base_simple/goal ───
    this.goalPub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/move_base_simple/goal',
      messageType: 'geometry_msgs/PoseStamped'
    });
  }

  sendGoal(x, y, w = 1.0) {
    if (!this.connected || !this.goalPub) {
      console.warn('[ROSBridge] Cannot send goal to ROS: Bridge not connected.');
      return false;
    }

    const poseMsg = new ROSLIB.Message({
      header: {
        frame_id: 'map',
        stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 }
      },
      pose: {
        position: { x: x, y: y, z: 0.0 },
        orientation: { x: 0.0, y: 0.0, z: 0.0, w: w }
      }
    });

    this.goalPub.publish(poseMsg);
    console.log('[ROSBridge] Goal dispatched to ROS /move_base_simple/goal:', x, y);
    return true;
  }

  setRobotPose(x, y, yaw = 0.0) {
    if (!this.connected || !this.ros) {
      console.warn('[ROSBridge] Cannot set pose to ROS: Bridge not connected.');
      return false;
    }

    const qz = Math.sin(yaw / 2.0);
    const qw = Math.cos(yaw / 2.0);

    // 1. Publish /initialpose for AMCL & RViz
    try {
      const initPub = new ROSLIB.Topic({
        ros: this.ros,
        name: '/initialpose',
        messageType: 'geometry_msgs/PoseWithCovarianceStamped'
      });

      const cov = new Array(36).fill(0);
      cov[0] = 0.04;
      cov[7] = 0.04;
      cov[35] = 0.03;

      const initMsg = new ROSLIB.Message({
        header: {
          frame_id: 'map',
          stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 }
        },
        pose: {
          pose: {
            position: { x: x, y: y, z: 0.0 },
            orientation: { x: 0.0, y: 0.0, z: qz, w: qw }
          },
          covariance: cov
        }
      });

      initPub.publish(initMsg);
      console.log('[ROSBridge] Published /initialpose to AMCL & RViz:', x, y, yaw);
    } catch (e) {
      console.warn('[ROSBridge] Error publishing /initialpose:', e);
    }

    // 2. Teleport physical robot in Gazebo via /gazebo/set_model_state
    try {
      const setModelStateClient = new ROSLIB.Service({
        ros: this.ros,
        name: '/gazebo/set_model_state',
        serviceType: 'gazebo_msgs/SetModelState'
      });

      const request = new ROSLIB.ServiceRequest({
        model_state: {
          model_name: 'turtlebot3_burger',
          pose: {
            position: { x: x, y: y, z: 0.01 },
            orientation: { x: 0.0, y: 0.0, z: qz, w: qw }
          },
          twist: {
            linear: { x: 0, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 0 }
          },
          reference_frame: 'world'
        }
      });

      setModelStateClient.callService(request, (result) => {
        if (result && result.success) {
          console.log('[ROSBridge] Gazebo robot teleported successfully to:', x, y);
        }
      }, (err) => {
        // Silently skip if service not reachable
      });
    } catch (e) {
      // Silently skip
    }

    // 3. Clear costmaps
    try {
      const clearCostmapsClient = new ROSLIB.Service({
        ros: this.ros,
        name: '/move_base/clear_costmaps',
        serviceType: 'std_srvs/Empty'
      });
      clearCostmapsClient.callService(new ROSLIB.ServiceRequest({}), () => {}, () => {});
    } catch (e) {}

    return true;
  }
}

if (typeof window !== 'undefined') {
  window.ROSBridge = ROSBridge;
}

/**
 * ROSBridge WebSocket Connector (roslibjs)
 * Synchronizes the 3D Web Simulator live with real ROS Melodic / Noetic:
 * - Subscribes to /odom (mirrors physical/Gazebo TurtleBot3)
 * - Subscribes to /cmd_vel (drives wheel animations)
 * - Subscribes to /move_base/status
 * - Publishes to /move_base_simple/goal (dispatches 3D web clicks directly to ROS)
 */

class ROSBridge {
  constructor(options = {}) {
    this.url = options.url || 'ws://localhost:9090';
    this.ros = null;
    this.connected = false;

    // Subscriptions & Publishers
    this.odomSub = null;
    this.cmdVelSub = null;
    this.statusSub = null;
    this.goalPub = null;

    // Event hooks
    this.onConnectionChange = null;
    this.onOdomReceived = null;
    this.onCmdVelReceived = null;
    this.onStatusReceived = null;
  }

  connect(customUrl = null) {
    if (customUrl) this.url = customUrl;

    if (typeof ROSLIB === 'undefined') {
      console.warn('[ROSBridge] ROSLIB not found. Live ROS sync disabled.');
      return;
    }

    try {
      this.ros = new ROSLIB.Ros({ url: this.url });

      this.ros.on('connection', () => {
        this.connected = true;
        console.log('[ROSBridge] Connected to ROS WebSocket server at:', this.url);
        this.setupTopics();
        if (this.onConnectionChange) this.onConnectionChange(true, 'Connected to ROS (' + this.url + ')');
      });

      this.ros.on('error', (err) => {
        this.connected = false;
        console.warn('[ROSBridge] Error connecting to ROS:', err);
        if (this.onConnectionChange) this.onConnectionChange(false, 'ROS Connection Error');
      });

      this.ros.on('close', () => {
        this.connected = false;
        console.log('[ROSBridge] Connection to ROS closed.');
        if (this.onConnectionChange) this.onConnectionChange(false, 'Disconnected (Standalone Mode)');
      });
    } catch (e) {
      console.warn('[ROSBridge] Exception starting WebSocket:', e);
      if (this.onConnectionChange) this.onConnectionChange(false, 'Standalone Mode');
    }
  }

  disconnect() {
    if (this.ros) {
      this.ros.close();
      this.connected = false;
    }
  }

  setupTopics() {
    if (!this.ros) return;

    // 1. Subscribe to /odom
    this.odomSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/odom',
      messageType: 'nav_msgs/Odometry'
    });

    this.odomSub.subscribe((message) => {
      const pos = message.pose.pose.position;
      const orient = message.pose.pose.orientation;

      // Extract yaw from quaternion (roll=0, pitch=0 on flat ground)
      const siny_cosp = 2 * (orient.w * orient.z + orient.x * orient.y);
      const cosy_cosp = 1 - 2 * (orient.y * orient.y + orient.z * orient.z);
      const yaw = Math.atan2(siny_cosp, cosy_cosp);

      if (this.onOdomReceived) {
        this.onOdomReceived(pos.x, pos.y, yaw);
      }
    });

    // 2. Subscribe to /cmd_vel
    this.cmdVelSub = new ROSLIB.Topic({
      ros: this.ros,
      name: '/cmd_vel',
      messageType: 'geometry_msgs/Twist'
    });

    this.cmdVelSub.subscribe((message) => {
      if (this.onCmdVelReceived) {
        this.onCmdVelReceived(message.linear.x, message.angular.z);
      }
    });

    // 3. Publisher for /move_base_simple/goal
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
}

if (typeof window !== 'undefined') {
  window.ROSBridge = ROSBridge;
}

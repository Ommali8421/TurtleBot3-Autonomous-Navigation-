import subprocess
import os
import sys

def run_cmd(cmd, timeout=1.8):
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return ""

def is_docker_desktop_running():
    try:
        res = subprocess.run(["tasklist", "/NH", "/FI", "IMAGENAME eq Docker Desktop.exe"], 
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1.5)
        if "Docker Desktop.exe" in res.stdout:
            return True
    except Exception:
        pass
    return False

def find_docker_desktop_exe():
    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"),
        r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
        os.path.expandvars(r"%ProgramFiles%\Docker\Docker\Docker Desktop.exe")
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return ""

def main():
    docker_exe = find_docker_desktop_exe()
    is_running = is_docker_desktop_running()

    # 1. Check for running container on Windows Docker
    out = run_cmd(["docker", "ps", "-q"])
    if out:
        cids = [c.strip() for c in out.splitlines() if c.strip()]
        if cids:
            print(f"STATUS=RUNNING\nMODE=WIN\nCID={cids[0]}\nDOCKER_EXE={docker_exe}")
            return

    # 2. Check for running container on WSL Docker
    out = run_cmd(["wsl", "-e", "docker", "ps", "-q"])
    if out:
        cids = [c.strip() for c in out.splitlines() if c.strip()]
        if cids:
            print(f"STATUS=RUNNING\nMODE=WSL\nCID={cids[0]}\nDOCKER_EXE={docker_exe}")
            return

    # 3. Check for stopped container named 'turtlebot3_sim' on Windows
    out = run_cmd(["docker", "ps", "-a", "-q", "--filter", "name=turtlebot3_sim"])
    if out:
        cids = [c.strip() for c in out.splitlines() if c.strip()]
        if cids:
            print(f"STATUS=STOPPED\nMODE=WIN\nCID={cids[0]}\nDOCKER_EXE={docker_exe}")
            return

    # 4. Check for stopped container on WSL
    out = run_cmd(["wsl", "-e", "docker", "ps", "-a", "-q", "--filter", "name=turtlebot3_sim"])
    if out:
        cids = [c.strip() for c in out.splitlines() if c.strip()]
        if cids:
            print(f"STATUS=STOPPED\nMODE=WSL\nCID={cids[0]}\nDOCKER_EXE={docker_exe}")
            return

    # 5. Check if any ROS container exists on Windows
    out = run_cmd(["docker", "ps", "-a", "-q", "--filter", "ancestor=osrf/ros:noetic-desktop-full"])
    if out:
        cids = [c.strip() for c in out.splitlines() if c.strip()]
        if cids:
            print(f"STATUS=STOPPED\nMODE=WIN\nCID={cids[0]}\nDOCKER_EXE={docker_exe}")
            return

    # 6. Check if Docker daemon is responsive but no container
    ver = run_cmd(["docker", "info"])
    if ver:
        print(f"STATUS=NO_CONTAINER\nMODE=WIN\nCID=\nDOCKER_EXE={docker_exe}")
        return

    # 7. Check if Docker Desktop is running as a process (maybe initializing)
    if is_running:
        print(f"STATUS=DOCKER_INITIALIZING\nMODE=WIN\nCID=\nDOCKER_EXE={docker_exe}")
        return

    # 8. Check if Docker Desktop is installed but stopped
    if docker_exe:
        print(f"STATUS=DOCKER_STOPPED\nMODE=WIN\nCID=\nDOCKER_EXE={docker_exe}")
        return

    # 9. Fallback
    print("STATUS=NO_DOCKER\nMODE=NONE\nCID=\nDOCKER_EXE=")

if __name__ == "__main__":
    main()

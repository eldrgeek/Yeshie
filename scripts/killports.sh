#!/bin/bash

# Define the ports to check
PORTS=(3000 3001)

# Function to find and kill processes for a given port
check_and_kill_port() {
    local port=$1
    echo "Checking port $port..."
    
    # Find process using the port
    pid=$(lsof -ti :$port)
    
    if [ -n "$pid" ]; then
        echo "Found process $pid using port $port"
        echo "Killing process..."
        kill -9 $pid
        if [ $? -eq 0 ]; then
            echo "Successfully killed process $pid"
        else
            echo "Failed to kill process $pid"
        fi
    else
        echo "No process found using port $port"
    fi
}

# Check each port
for port in "${PORTS[@]}"; do
    check_and_kill_port $port
done

# Final check to verify ports are free
echo -e "\nVerifying ports are free..."
for port in "${PORTS[@]}"; do
    if lsof -ti :$port >/dev/null; then
        echo "Warning: Port $port is still in use"
    else
        echo "Port $port is free"
    fi
done
import { forwardRef, useImperativeHandle, useState, useEffect } from "react";
import {Socket } from 'socket.io-client';
import {
  ChakraProvider,
  Box,
  Input,
  Button,
  VStack,
  HStack,
  Text,
} from "@chakra-ui/react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface RewindProps {
  socket: Socket | null; // Add this line
  sessionId: string;
}


const Rewind = forwardRef<{ handleGoClick: () => void; handleKeyDown: (event: KeyboardEvent) => void }, RewindProps>(({ socket, sessionId }, ref) => {
  const [timestamp, setTimestamp] = useState("");
  const [message, setMessage] = useState("Message goes here");
  
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
      const date = new Date()
      setSelectedDate(new Date())
      handleDateTimeChange(date)
  }, []);

  const openRewindMoment = (timestamp: string) => {
    setMessage(`Open ${timestamp}`);
    const url = `rewindai://show-moment?timestamp=${timestamp}`;
    window.open(url, "_blank");
  };

  const handleGoClick = () => {
    if (socket) { // Check if socket is not null
      socket.emit("monitor", { op: "rewind", sessionId, timestamp: timestamp });
      openRewindMoment(timestamp);
    } else {
      console.error("Socket is not connected");
    }
  };

  const handleCalibrate = () => {
    if (socket) {
      socket.emit("monitor", { op: "calibrate" });
    } else {
      console.error("Socket is not connected");
    }
  };

  const handleDateTimeChange = (date: Date | null) => {
    if (date) { // Check if date is not null
      setSelectedDate(date);
      setTimestamp((date.getTime() / 1000).toFixed(3));
    }
  };

  const handleTimestampChange = (e: { target: { value: any; }; }) => {
    const newTimestamp = e.target.value;
    setTimestamp(newTimestamp);
    const date = new Date(parseFloat(newTimestamp) * 1000);
    if (!isNaN(date.getTime())) {
      setSelectedDate(date);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleGoClick();
    }
  };

  useImperativeHandle(ref, () => ({
    handleGoClick,
    handleKeyDown,
  }));

  return (
    <ChakraProvider>
        {message}
      <Box p={4}>
        <VStack spacing={4} align="stretch">
          <HStack spacing={4}>
            <Box>
              <Text mb={2}>Date:</Text>
              <DatePicker
                selected={selectedDate}
                onChange={handleDateTimeChange}
                dateFormat="MMMM d, yyyy"
                customInput={<Input />}
              />
            </Box>
            <Box>
              <Text mb={2}>Time:</Text>
              <DatePicker
                selected={selectedDate}
                onChange={handleDateTimeChange}
                showTimeSelect
                showTimeSelectOnly
                timeIntervals={15}
                timeCaption="Time"
                dateFormat="h:mm aa"
                customInput={<Input />}
              />
            </Box>
          </HStack>
          <Box>
            <Text mb={2}>Timestamp:</Text>
            <Input
              value={timestamp}
              onChange={handleTimestampChange}
              placeholder="Enter timestamp"
            />
          </Box>
          <HStack spacing={4}>
            <Button colorScheme="blue" onClick={handleGoClick} flex={1}>
              Go
            </Button>
            <Button colorScheme="green" onClick={handleCalibrate} flex={1}>
              Calibrate
            </Button>
          </HStack>
        </VStack>
      </Box>
    </ChakraProvider>
  );
});

export default Rewind;


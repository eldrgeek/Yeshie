
import { spawn } from 'child_process';
import concurrently from 'concurrently';
import { cp } from 'fs';
import { exit } from 'process';

interface Job {
  name: string;
  do: string;
}

const jobs: Job[] = [
  { name: "server", do: "nodemon --watch src -e ts,tsx --exec ts-node src/server.ts" },
  { name: "client", do: "cd client && npm run dev" },
  { name: "listener", do: "nodemon --watch src -e py --exec python src/listener.py" },
  { name: "monitor", do: "nodemon --watch src -e py --exec python src/monitor.py" },
  { name: "testkb", do: "nodemon --watch src -e py --exec python src/testkb.py" },
  { name: "winmonitor", do: "nodemon --watch src -e py --exec python src/winmonitor.py" },
  { name: "extension", do: "cd extension && npm run dev" },
  { name: "messages", do: "nodemon -watch scripts/messages.sh --exec ./scripts/messages.sh" },
  { name: "llm", do: "nodemon --watch src -e py --exec python src/llmserver.py" },
  { name: "codeStore", do: "nodemon --watch src/codeStore.py -e py --exec python src/codeStore.py" }
]


const profiles: { [key: string]: string[] } = {
  default:["dev"],
  dev: ["monitor", "server", "client", "extension"],
  win: ["winmonitor", "extension"],
  llm: ["server", "llm"],
  all: jobs.map(job => job.name)
};

function runJobs(jobNames: string[]) {
  const jobsToRun = jobs.filter(job => jobNames.includes(job.name));
  console.log(`Running jobs: ${jobsToRun.map(job => job.name).join(', ')}`);
  concurrently(jobsToRun.map(job => ({ command: job.do, name: job.name })));
}

function main() {
  const args = process.argv.slice(2)
  let profile = args[0];
  
  if (profile) {    
    if (profile in profiles) {
      console.log(`Running profile: ${profile}`);
      runJobs(profiles[profile]);
    } else if (jobs.find(job => job.name === profile)) {
      runJobs([profile]);
    } else {
    console.error(`Profile "${profile}" not found. Available profiles: ${Object.keys(profiles).join(', ')}`);
    process.exit(1);
    }
  } else {
    console.log(`Running default profile`);
    runJobs(profiles['default']);
  }
}

main();
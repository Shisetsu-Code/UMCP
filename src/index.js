#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const options={};const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  switch(args[i]){
    case '--headless':options.headless=true;break;
    case '--headed':options.headless=false;break;
    case '--artifacts':if(!args[i+1])throw new Error('--artifacts requires a directory');options.artifactDir=args[++i];break;
    case '--version':console.log('umcp-local 0.1.0');process.exit(0);break;
    case '--help':console.log('UMCP local MCP server (stdio)\nUsage: node src/index.js [--headless|--headed] [--artifacts DIR]\nEnvironment: UMCP_HEADLESS=true, UMCP_ARTIFACT_DIR, UMCP_EXECUTABLE_PATH\nInstall browser: npx playwright install chromium\nConfigure this command in an MCP stdio client.');process.exit(0);break;
    default:throw new Error(`Unknown argument: ${args[i]}`);
  }
}
const {server,service}=createServer(options);
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;await service.shutdown();await server.close();};
process.on('SIGINT',()=>{void stop().finally(()=>process.exit(0));});
process.on('SIGTERM',()=>{void stop().finally(()=>process.exit(0));});
process.stdin.on('end',()=>{void stop();});
process.on('unhandledRejection',error=>{console.error('UMCP error:',error);void stop().finally(()=>process.exit(1));});
await server.connect(new StdioServerTransport());

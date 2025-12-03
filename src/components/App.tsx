/**
 * Main Ink App component for routing commands.
 */

import React from 'react';
import { Text, Box } from 'ink';
import { AppProps } from '../types.js';
import UpdateCommand from './UpdateCommand.js';
import MergeCommand from './MergeCommand.js';

const App: React.FC<AppProps> = ({ command, args, flags }) => {
  // No command provided, show help
  if (!command) {
    return (
      <Box flexDirection="column">
        <Text bold>plaud-tm - Plaud Timestamp Manager</Text>
        <Text> </Text>
        <Text bold>Usage:</Text>
        <Text>  $ plaud-tm &lt;command&gt; [options]</Text>
        <Text> </Text>
        <Text bold>Commands:</Text>
        <Text>  update &lt;file&gt;      Update timestamps in transcript</Text>
        <Text>  merge &lt;patterns&gt;   Merge multiple transcripts</Text>
        <Text> </Text>
        <Text bold>Options for update:</Text>
        <Text>  --time &lt;time&gt;      Start time (HH:MM:SS) [required]</Text>
        <Text>  --date &lt;date&gt;      Start date (YYYY-MM-DD) [required]</Text>
        <Text>  --output-dir &lt;dir&gt; Output directory prefix</Text>
        <Text>  --flat             Use flat format</Text>
        <Text> </Text>
        <Text bold>Options for merge:</Text>
        <Text>  --output &lt;file&gt;    Output file path</Text>
        <Text>  --no-delete        Keep source files</Text>
        <Text> </Text>
        <Text bold>Examples:</Text>
        <Text>  $ plaud-tm update transcript.txt --time 18:06:13 --date 2024-03-15</Text>
        <Text>  $ plaud-tm merge "2024/03/15/*.txt" --output merged.txt</Text>
      </Box>
    );
  }

  // Route to appropriate command
  switch (command) {
    case 'update':
      return <UpdateCommand args={args} flags={flags} />;
    case 'merge':
      return <MergeCommand args={args} flags={flags} />;
    default:
      return (
        <Box>
          <Text color="red">Unknown command: {command}</Text>
        </Box>
      );
  }
};

export default App;

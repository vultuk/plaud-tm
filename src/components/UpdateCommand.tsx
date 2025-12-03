/**
 * UpdateCommand Ink component for the update command UI.
 */

import React, { useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import Spinner from 'ink-spinner';
import { executeUpdate } from '../commands/update.js';
import { UpdateArgs } from '../types.js';

interface UpdateCommandProps {
  args: string[];
  flags: Record<string, any>;
}

const UpdateCommand: React.FC<UpdateCommandProps> = ({ args, flags }) => {
  const [status, setStatus] = useState<'validating' | 'processing' | 'success' | 'error'>('validating');
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [hasWarning, setHasWarning] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        // Validate required arguments
        if (args.length === 0) {
          setError('Missing required argument: <file>');
          setStatus('error');
          return;
        }

        if (!flags.time) {
          setError('Missing required option: --time <time>');
          setStatus('error');
          return;
        }

        if (!flags.date) {
          setError('Missing required option: --date <date>');
          setStatus('error');
          return;
        }

        // Build UpdateArgs
        const updateArgs: UpdateArgs = {
          file: args[0],
          time: flags.time,
          date: flags.date,
          outputDir: flags.outputDir,
          flat: flags.flat || false,
        };

        setStatus('processing');

        // Execute update
        const result = await executeUpdate(updateArgs);
        setOutputPath(result.outputPath);
        setHasWarning(result.hasOutOfOrderTimestamps);
        setStatus('success');
      } catch (err: any) {
        setError(err.message || 'An unknown error occurred');
        setStatus('error');
      }
    };

    run();
  }, [args, flags]);

  if (status === 'validating' || status === 'processing') {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> {status === 'validating' ? 'Validating...' : 'Processing transcript...'}</Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>Error:</Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {hasWarning && (
        <Text color="yellow">Warning: timestamps in input were not in chronological order</Text>
      )}
      <Text color="green">Wrote {outputPath}</Text>
    </Box>
  );
};

export default UpdateCommand;

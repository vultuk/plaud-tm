/**
 * MergeCommand Ink component for the merge command UI.
 */

import React, { useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import Spinner from 'ink-spinner';
import { executeMerge } from '../commands/merge.js';
import { MergeArgs } from '../types.js';

interface MergeCommandProps {
  args: string[];
  flags: Record<string, any>;
}

const MergeCommand: React.FC<MergeCommandProps> = ({ args, flags }) => {
  const [status, setStatus] = useState<'validating' | 'processing' | 'success' | 'error'>('validating');
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        // Validate required arguments
        if (args.length === 0) {
          setError('Missing required argument: <patterns>');
          setStatus('error');
          return;
        }

        // Build MergeArgs
        const mergeArgs: MergeArgs = {
          patterns: args,
          output: flags.output,
          noDelete: flags.delete === false, // meow converts --no-delete to delete: false
        };

        setStatus('processing');

        // Execute merge
        const result = await executeMerge(mergeArgs);
        setFiles(result.files);
        setOutputPath(result.outputPath);
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
        <Text> {status === 'validating' ? 'Validating...' : 'Merging transcripts...'}</Text>
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
      {files.map((file) => (
        <Text key={file}>{file}</Text>
      ))}
      <Text color="green">Merged into {outputPath}</Text>
    </Box>
  );
};

export default MergeCommand;

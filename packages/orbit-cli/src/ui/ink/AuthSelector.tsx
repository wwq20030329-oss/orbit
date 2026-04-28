import React from 'react';
import { Text, useInput, Box } from 'ink';

export type AuthMethod = 'mobile';

interface AuthSelectorProps {
    onSelect: (method: AuthMethod) => void;
    onCancel: () => void;
}

export const AuthSelector: React.FC<AuthSelectorProps> = ({ onSelect, onCancel }) => {
    const options: Array<{ 
        method: AuthMethod; 
        label: string; 
    }> = [
        {
            method: 'mobile',
            label: 'Mobile App'
        }
    ];

    useInput((input, key) => {
        if (key.return) {
            onSelect('mobile');
        } else if (key.escape || (key.ctrl && input === 'c')) {
            onCancel();
        } else if (input === '1') {
            onSelect('mobile');
        }
    });

    return (
        <Box flexDirection="column" paddingY={1}>
            <Box marginBottom={1}>
                <Text>How would you like to authenticate?</Text>
            </Box>

            <Box flexDirection="column">
                {options.map((option, index) => {
                    return (
                        <Box key={option.method} marginY={0}>
                            <Text color="cyan">
                                › {' '}
                                {index + 1}. {option.label}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            <Box marginTop={1}>
                <Text dimColor>Press Enter or 1 to confirm, Esc to cancel</Text>
            </Box>
        </Box>
    );
};

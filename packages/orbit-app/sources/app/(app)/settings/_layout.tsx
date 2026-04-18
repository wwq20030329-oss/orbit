import { Stack } from 'expo-router';

export default function SettingsLayout() {
    return (
        <Stack>
            <Stack.Screen
                name="index"
                options={{
                    headerShown: false,
                    presentation: 'transparentModal',
                    animation: 'fade',
                    contentStyle: {
                        backgroundColor: 'transparent',
                    },
                }}
            />
        </Stack>
    );
}

import * as React from 'react';
import {
    View,
    Text,
    StyleProp,
    ViewStyle,
    TextStyle,
    Platform
} from 'react-native';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

interface ItemChildProps {
    showDivider?: boolean;
    [key: string]: any;
}

export interface ItemGroupProps {
    title?: string | React.ReactNode;
    footer?: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    headerStyle?: StyleProp<ViewStyle>;
    footerStyle?: StyleProp<ViewStyle>;
    titleStyle?: StyleProp<TextStyle>;
    footerTextStyle?: StyleProp<TextStyle>;
    containerStyle?: StyleProp<ViewStyle>;
}

const stylesheet = StyleSheet.create((theme, runtime) => ({
    wrapper: {
        alignItems: 'center',
    },
    container: {
        width: '100%',
        maxWidth: layout.maxWidth,
        paddingHorizontal: 0,
    },
    header: {
        paddingTop: Platform.select({ ios: 26, default: 18 }),
        paddingBottom: Platform.select({ ios: 8, default: 10 }),
        paddingHorizontal: Platform.select({ ios: 24, default: 20 }),
    },
    headerNoTitle: {
        paddingTop: Platform.select({ ios: 14, default: 12 }),
    },
    headerText: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 12, default: 13 }),
        lineHeight: Platform.select({ ios: 18, default: 18 }),
        letterSpacing: Platform.select({ ios: 0.08, default: 0.24 }),
        textTransform: 'uppercase',
        fontWeight: Platform.select({ ios: 'normal', default: '500' }),
    },
    contentContainer: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: 16,
        borderRadius: Platform.select({ ios: 16, default: 18 }),
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: Platform.select({ ios: 0.04, default: 0.02 }),
        shadowRadius: 10,
        elevation: 1,
    },
    footer: {
        paddingTop: Platform.select({ ios: 8, default: 10 }),
        paddingBottom: Platform.select({ ios: 10, default: 16 }),
        paddingHorizontal: Platform.select({ ios: 24, default: 20 }),
    },
    footerText: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 13, default: 13 }),
        lineHeight: Platform.select({ ios: 18, default: 20 }),
        letterSpacing: Platform.select({ ios: -0.08, default: 0 }),
    },
}));

export const ItemGroup = React.memo<ItemGroupProps>((props) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;

    const {
        title,
        footer,
        children,
        style,
        headerStyle,
        footerStyle,
        titleStyle,
        footerTextStyle,
        containerStyle
    } = props;

    return (
        <View style={[styles.wrapper, style]}>
            <View style={styles.container}>
                {/* Header */}
                {title ? (
                    <View style={[styles.header, headerStyle]}>
                        {typeof title === 'string' ? (
                            <Text style={[styles.headerText, titleStyle]}>
                                {title}
                            </Text>
                        ) : (
                            title
                        )}
                    </View>
                ) : (
                    // Add top margin when there's no title
                    <View style={styles.headerNoTitle} />
                )}

                {/* Content Container */}
                <View style={[styles.contentContainer, containerStyle]}>
                    {React.Children.map(children, (child, index) => {
                        if (React.isValidElement<ItemChildProps>(child)) {
                            // Don't add props to React.Fragment
                            if (child.type === React.Fragment) {
                                return child;
                            }
                            const isLast = index === React.Children.count(children) - 1;
                            const childProps = child.props as ItemChildProps;
                            return React.cloneElement(child, {
                                ...childProps,
                                showDivider: !isLast && childProps.showDivider !== false
                            });
                        }
                        return child;
                    })}
                </View>

                {/* Footer */}
                {footer && (
                    <View style={[styles.footer, footerStyle]}>
                        <Text style={[styles.footerText, footerTextStyle]}>
                            {footer}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
});

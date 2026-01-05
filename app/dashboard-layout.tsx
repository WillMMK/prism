
import { View, Text, StyleSheet } from 'react-native';

export default function DashboardLayout() {
    return (
        <View style={styles.container}>
            <Text>Dashboard Layout Settings</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

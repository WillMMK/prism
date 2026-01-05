
import { View, Text, StyleSheet } from 'react-native';

export default function CategoryStyles() {
    return (
        <View style={styles.container}>
            <Text>Category Styles Settings</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
});

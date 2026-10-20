import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { AppField } from "@/components/app-field";
import { ScreenHeader } from "@/components/screen-header";
import { space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";
import { useShop } from "@/state/shop";

/** Sign in with a phone number; the code arrives by text. */
export default function SignIn() {
  const { colors, type } = useMotifTheme();
  const shop = useShop();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  const send = () => {
    if (phone.replace(/\D/g, "").length !== 8) {
      setError(strings.phoneError);
      return;
    }
    setError(undefined);
    setSending(true);
    // In memory: the code is taken as sent and the member signed in.
    setTimeout(() => {
      shop.signIn();
      setSending(false);
      router.back();
    }, 600);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={strings.signInTitle} back />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[type.body, { color: colors.textSecondary }]}>{strings.signInIntro}</Text>
        <AppField
          label={strings.phone}
          value={phone}
          onChangeText={setPhone}
          helper={strings.phoneHelper}
          error={error}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <View style={styles.actions}>
          <AppButton label={strings.sendCode} onPress={send} loading={sending} />
          <Text style={[type.caption, { color: colors.textSecondary, opacity: 0.5 }]}>{strings.textRates}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { gap: space.s6, padding: space.s4 },
  actions: { gap: space.s3 },
});

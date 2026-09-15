import { useChat } from "@ai-sdk/react";
import { Ionicons } from "@expo/vector-icons";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { Container } from "@/components/container";
import { NAV_THEME } from "@/lib/constants";
import { useColorScheme } from "@/lib/use-color-scheme";

import { ENV } from "../../src/env";

const starterPrompts = [
  {
    label: "Plan a feature",
    prompt: "Help me plan the first version of a habit tracking feature.",
  },
  {
    label: "Draft an API",
    prompt: "Sketch a clean API contract for projects, tasks, and comments.",
  },
  {
    label: "Debug an issue",
    prompt: "Walk me through debugging a slow mobile screen.",
  },
];

const generateAPIUrl = (relativePath: string) => {
  const serverUrl = ENV.EXPO_PUBLIC_SERVER_URL;
  if (!serverUrl) {
    throw new Error("EXPO_PUBLIC_SERVER_URL environment variable is not defined");
  }
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return serverUrl.concat(path);
};

export default function AIScreen() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
  const [input, setInput] = useState("");
  const { messages, error, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: generateAPIUrl("/ai"),
    }),
    onError: (error) => console.error(error, "AI Chat Error"),
  });
  const scrollViewRef = useRef<ScrollView>(null);
  const isBusy = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;
  const canSend = Boolean(input.trim()) && !isBusy;

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, isBusy]);

  function sendPrompt(prompt: string) {
    const value = prompt.trim();
    if (!value || isBusy) return;

    sendMessage({ text: value });
    setInput("");
  }

  function onNewChat() {
    if (isBusy) return;
    setInput("");
    setMessages([]);
  }

  return (
    <Container>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          <View style={[styles.toolbar, { borderBottomColor: theme.border }]}>
            <View style={styles.statusGroup}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isBusy ? theme.primary : theme.border },
                ]}
              />
              <Text style={[styles.statusText, { color: theme.text }]}>
                {isBusy
                  ? status === "submitted"
                    ? "Sending"
                    : "Streaming"
                  : hasMessages
                    ? `${messages.length} messages`
                    : "Ready"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onNewChat}
              disabled={isBusy || !hasMessages}
              style={[
                styles.toolbarAction,
                { borderColor: theme.border },
                (isBusy || !hasMessages) && styles.toolbarActionDisabled,
              ]}
            >
              <Ionicons name="add" size={16} color={theme.text} />
              <Text style={[styles.toolbarActionText, { color: theme.text }]}>New</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!hasMessages ? (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIcon, { borderColor: theme.border }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={28} color={theme.text} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Start a conversation</Text>
                <Text style={[styles.emptyText, { color: theme.text }]} selectable>
                  Use a starter prompt or ask your own question.
                </Text>
                <View style={styles.promptList}>
                  {starterPrompts.map((item) => (
                    <TouchableOpacity
                      key={item.label}
                      onPress={() => sendPrompt(item.prompt)}
                      disabled={isBusy}
                      style={[
                        styles.promptButton,
                        {
                          backgroundColor: theme.card,
                          borderColor: theme.border,
                        },
                        isBusy && styles.toolbarActionDisabled,
                      ]}
                    >
                      <Text style={[styles.promptLabel, { color: theme.text }]}>{item.label}</Text>
                      <Text style={[styles.promptText, { color: theme.text }]}>{item.prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.messagesList}>
                {messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      message.role === "user" ? styles.userRow : styles.assistantRow,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        message.role === "user"
                          ? [styles.userBubble, { backgroundColor: theme.primary }]
                          : [
                              styles.assistantBubble,
                              {
                                backgroundColor: theme.card,
                                borderColor: theme.border,
                              },
                            ],
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageRole,
                          {
                            color: message.role === "user" ? "#ffffff" : theme.text,
                          },
                        ]}
                      >
                        {message.role === "user" ? "You" : "AI"}
                      </Text>
                      <View style={styles.messageParts}>
                        {(message.parts ?? []).map((part, i) =>
                          part.type === "text" ? (
                            <Text
                              key={`${message.id}-${i}`}
                              selectable
                              style={[
                                styles.messageText,
                                {
                                  color: message.role === "user" ? "#ffffff" : theme.text,
                                },
                              ]}
                            >
                              {part.text}
                            </Text>
                          ) : (
                            <Text
                              key={`${message.id}-${i}`}
                              selectable
                              style={[
                                styles.messageText,
                                {
                                  color: message.role === "user" ? "#ffffff" : theme.text,
                                },
                              ]}
                            >
                              {JSON.stringify(part)}
                            </Text>
                          ),
                        )}
                      </View>
                    </View>
                  </View>
                ))}
                {isBusy && (
                  <View style={[styles.messageRow, styles.assistantRow]}>
                    <View
                      style={[
                        styles.messageBubble,
                        styles.assistantBubble,
                        {
                          backgroundColor: theme.card,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.messageRole, { color: theme.text }]}>AI</Text>
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={[styles.loadingText, { color: theme.text }]}>Thinking...</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {error && (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.notification,
                },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={18} color={theme.notification} />
              <Text selectable style={[styles.errorText, { color: theme.text }]}>
                {error.message}
              </Text>
            </View>
          )}

          <View style={[styles.inputContainer, { borderTopColor: theme.border }]}>
            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Message AI..."
                placeholderTextColor={theme.border}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  },
                ]}
                onSubmitEditing={(e) => {
                  e.preventDefault();
                  sendPrompt(input);
                }}
                editable={!isBusy}
                returnKeyType="send"
                multiline
              />
              <TouchableOpacity
                onPress={() => sendPrompt(input)}
                disabled={!canSend}
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: canSend ? theme.primary : theme.card,
                    borderColor: theme.border,
                  },
                  !canSend && styles.sendButtonDisabled,
                ]}
              >
                <Ionicons name="arrow-up" size={20} color={canSend ? "#ffffff" : theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  toolbar: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingTop: 8,
  },
  statusGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  statusDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  statusText: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  toolbarAction: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  toolbarActionDisabled: {
    opacity: 0.45,
  },
  toolbarActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    paddingVertical: 16,
  },
  emptyContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  emptyIcon: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.68,
    textAlign: "center",
  },
  promptList: {
    gap: 8,
    marginTop: 8,
    width: "100%",
  },
  promptButton: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  promptLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  promptText: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.68,
  },
  messagesList: {
    gap: 12,
  },
  messageRow: {
    flexDirection: "row",
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    borderRadius: 18,
    maxWidth: "86%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    borderTopRightRadius: 6,
  },
  assistantBubble: {
    borderTopLeftRadius: 6,
    borderWidth: 1,
  },
  messageRole: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
    opacity: 0.72,
  },
  messageParts: {
    gap: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  loadingContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.68,
  },
  errorBanner: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  inputContainer: {
    borderTopWidth: 1,
    paddingBottom: 12,
    paddingTop: 12,
  },
  inputRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sendButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sendButtonDisabled: {
    borderWidth: 1,
    opacity: 0.55,
  },
});

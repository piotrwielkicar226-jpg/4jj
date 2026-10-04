import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert } from 'react-native';
import { Provider as PaperProvider, TextInput, Button, Text, Card, List } from 'react-native-paper';

const GITHUB_API = "https://api.github.com";

function parseBlob(blob) {
  // Format: --- FILE: sciezka/do/pliku ---\n kod \n
  const files = [];
  const regex = /---\s*FILE:\s*(.+?)\s*---\s*\n([\s\S]*?)(?=---\s*FILE:|\s*$)/g;
  let match;
  while ((match = regex.exec(blob)) !== null) {
    const path = match[1].trim();
    const content = match[2].trim();
    if (path && content) files.push({ path, content });
  }
  return files;
}

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState('');
  const [repo, setRepo] = useState('FireTrail-Auto');
  const [blob, setBlob] = useState('');
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

  const buildRepo = async () => {
    if (!token || !user || !repo || !blob) {
      Alert.alert("Błąd", "Wypełnij wszystkie pola!");
      return;
    }
    const files = parseBlob(blob);
    if (files.length === 0) {
      Alert.alert("Błąd", "Nie wykryłem żadnych plików! Użyj formatu --- FILE: sciezka ---");
      return;
    }
    setLoading(true);
    setLog([]);
    addLog(`Wykryto ${files.length} plików`);

    const headers = { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" };

    // 1. Create repo
    addLog(`Tworzę repo ${repo}...`);
    try {
      const res = await fetch(`${GITHUB_API}/user/repos`, {
        method: 'POST',
        headers, body: JSON.stringify({ name: repo, private: false, auto_init: false })
      });
      if (res.status === 201) addLog("Repo utworzone!");
      else if (res.status === 422) addLog("Repo już istnieje, pushuję do niego...");
      else { const t = await res.text(); addLog(`Błąd tworzenia: ${t}`); }
    } catch (e) { addLog(`Błąd: ${e.message}`); }

    // 2. Push files
    for (const f of files) {
      addLog(`Wrzucam: ${f.path}`);
      const content_b64 = btoa(unescape(encodeURIComponent(f.content)));
      try {
        const url = `${GITHUB_API}/repos/${user}/${repo}/contents/${f.path}`;
        // check if exists to get sha
        let sha = undefined;
        const getRes = await fetch(url, { headers });
        if (getRes.ok) {
          const j = await getRes.json();
          sha = j.sha;
        }
        const putBody = { message: `AutoBuilder: ${f.path}`, content: content_b64 };
        if (sha) putBody.sha = sha;
        const putRes = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(putBody) });
        if (putRes.ok) addLog(`OK: ${f.path}`);
        else addLog(`FAIL ${f.path}: ${await putRes.text()}`);
      } catch (e) { addLog(`EXC ${f.path}: ${e.message}`); }
    }
    addLog(`GOTOWE! https://github.com/${user}/${repo}`);
    setLoading(false);
  };

  return (
    <PaperProvider>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
        <Text variant="headlineMedium" style={{ marginBottom: 10 }}>AutoBuilder Agent</Text>
        <Text style={{ marginBottom: 16 }}>Wklej wielki zlepek od AI, a apka sama posegreguje pliki na GitHubie.</Text>

        <Card style={{ marginBottom: 12 }}><Card.Content>
          <TextInput label="GitHub Token (ghp_...)" value={token} onChangeText={setToken} secureTextEntry style={{ marginBottom: 8 }} />
          <TextInput label="GitHub Nick (np. piotr123)" value={user} onChangeText={setUser} style={{ marginBottom: 8 }} />
          <TextInput label="Nazwa nowego repo" value={repo} onChangeText={setRepo} style={{ marginBottom: 8 }} />
        </Card.Content></Card>

        <Card style={{ marginBottom: 12 }}><Card.Content>
          <TextInput label="WIELKI ZLEPEK OD AI" value={blob} onChangeText={setBlob} multiline numberOfLines={12} style={{ minHeight: 250, textAlignVertical: 'top' }} placeholder={"--- FILE: pom.xml ---\n<project>...</project>\n--- FILE: src/main/resources/plugin.yml ---\nname: FireTrail..."} />
        </Card.Content></Card>

        <Button mode="contained" onPress={buildRepo} loading={loading} style={{ marginBottom: 16 }}>ZBUDUJ REPO AUTOMATYCZNIE</Button>

        <Card><Card.Content>
          <Text variant="titleMedium">Log:</Text>
          {log.map((l, i) => <Text key={i} style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 4 }}>{l}</Text>)}
        </Card.Content></Card>
      </ScrollView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#f5f5f5' } });

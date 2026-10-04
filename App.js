import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Provider as PaperProvider, TextInput, Button, Text, Card, Chip } from 'react-native-paper';
import { encode as b64Encode } from 'base-64';
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

const GITHUB_API = "https://api.github.com";

// --- POPRAWIONY PARSER: linijka po linijce, odporny na --- FILE: w treści ---
function parseBlob(blob) {
  if (!blob || !blob.trim()) return { files: [], errors: ['Zlepek jest pusty'] };
  
  const lines = blob.split('\n');
  const files = [];
  let currentPath = null;
  let currentContent = [];
  let errors = [];
  let lineNum = 0;

  const fileHeaderRegex = /^---\s*FILE:\s*(.+?)\s*---\s*$/;

  for (const line of lines) {
    lineNum++;
    const headerMatch = line.match(fileHeaderRegex);
    if (headerMatch) {
      // zapisz poprzedni plik
      if (currentPath) {
        const content = currentContent.join('\n').trim();
        if (!content) {
          errors.push(`Plik ${currentPath} jest pusty (linia ~${lineNum})`);
        } else {
          files.push({ path: currentPath, content });
        }
      }
      const rawPath = headerMatch[1].trim();
      // walidacja ścieżki
      if (!rawPath || rawPath.includes('..') || rawPath.startsWith('/')) {
        errors.push(`Nieprawidłowa ścieżka: "${rawPath}" (linia ${lineNum})`);
        currentPath = null;
        currentContent = [];
      } else {
        currentPath = rawPath;
        currentContent = [];
      }
    } else {
      if (currentPath) currentContent.push(line);
    }
  }
  // ostatni plik
  if (currentPath) {
    const content = currentContent.join('\n').trim();
    if (content) files.push({ path: currentPath, content });
  }

  if (files.length === 0 && errors.length === 0) {
    errors.push('Nie wykryto żadnego bloku --- FILE: sciezka ---');
  }

  return { files, errors };
}

// Walidacje
function validateInputs(token, user, repo, blob) {
  const errs = [];
  if (!token || token.length < 10) errs.push('Token jest za krótki');
  else if (!token.startsWith('ghp_') && !token.startsWith('github_pat_') && !token.startsWith('gh_')) {
    errs.push('Token powinien zaczynać się od ghp_, github_pat_ lub gh_');
  }
  if (!user || !/^[a-zA-Z0-9-]{1,39}$/.test(user)) {
    errs.push('Login GitHub: tylko litery, cyfry i myślnik, max 39 znaków');
  }
  if (!repo || !/^[a-zA-Z0-9._-]{1,100}$/.test(repo)) {
    errs.push('Nazwa repo: tylko litery, cyfry, ., -, _ bez spacji (max 100)');
  }
  if (!blob || blob.trim().length < 20) errs.push('Zlepek jest pusty lub za krótki');
  return errs;
}

function safeBase64(content) {
  try {
    // Najbardziej kompatybilne: Buffer -> base64, obsługuje UTF-8, emoji, polskie znaki
    return Buffer.from(content, 'utf-8').toString('base64');
  } catch (e) {
    // fallback na base-64 lib
    return b64Encode(unescape(encodeURIComponent(content)));
  }
}

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState('');
  const [repo, setRepo] = useState('FireTrail-Auto');
  const [blob, setBlob] = useState('');
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg, type='info') => {
    const icon = type==='error' ? '❌' : type==='ok' ? '✅' : type==='warn' ? '⚠️' : '→';
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} ${icon} ${msg}`]);
  };

  const buildRepo = async () => {
    setLog([]);
    // 1. Walidacja wejścia
    const inputErrors = validateInputs(token, user, repo, blob);
    if (inputErrors.length > 0) {
      inputErrors.forEach(e => addLog(e, 'error'));
      Alert.alert("Błąd walidacji", inputErrors.join("\n"));
      return;
    }

    const { files, errors: parseErrors } = parseBlob(blob);
    parseErrors.forEach(e => addLog(e, 'warn'));
    
    if (files.length === 0) {
      addLog('Nie wykryto plików do wrzucenia', 'error');
      return;
    }

    setLoading(true);
    addLog(`Wykryto ${files.length} plików`, 'ok');

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    };

    // 2. Sprawdź token - GET /user
    try {
      addLog('Sprawdzam token...');
      const meRes = await fetch(`${GITHUB_API}/user`, { headers });
      if (meRes.status === 401) throw new Error('401 - Nieprawidłowy token (sprawdź czy nie wygasł)');
      if (meRes.status === 403) throw new Error('403 - Brak uprawnień lub rate limit');
      if (!meRes.ok) throw new Error(`Auth check failed: ${meRes.status}`);
      const me = await meRes.json();
      addLog(`Zalogowano jako ${me.login}`, 'ok');
      if (me.login.toLowerCase() !== user.toLowerCase()) {
        addLog(`Uwaga: token należy do ${me.login}, a wpisałeś ${user}`, 'warn');
      }
    } catch (e) {
      addLog(e.message, 'error');
      Alert.alert("Błąd tokenu", e.message);
      setLoading(false);
      return;
    }

    // 3. Stwórz repo
    try {
      addLog(`Tworzę repo ${user}/${repo}...`);
      const res = await fetch(`${GITHUB_API}/user/repos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: repo, private: false, auto_init: false, description: "Created by AutoBuilder Agent" })
      });
      if (res.status === 201) addLog("Repo utworzone!", 'ok');
      else if (res.status === 422) addLog("Repo już istnieje, pushuję do niego...", 'warn');
      else if (res.status === 401) throw new Error('401 przy tworzeniu repo - token bez scope repo');
      else if (res.status === 403) throw new Error('403 - brak uprawnień do tworzenia repo');
      else {
        const t = await res.text();
        addLog(`Odp tworzenia repo: ${res.status} ${t}`, 'warn');
      }
    } catch (e) {
      addLog(`Błąd tworzenia: ${e.message}`, 'error');
      setLoading(false);
      return;
    }

    // 4. Push plików z retry
    let successCount = 0;
    for (const f of files) {
      addLog(`Wrzucam: ${f.path}`);
      let retries = 1;
      while (retries >= 0) {
        try {
          const content_b64 = safeBase64(f.content);
          const url = `${GITHUB_API}/repos/${user}/${repo}/contents/${encodeURIComponent(f.path).replace(/%2F/g, '/')}`;
          
          let sha = undefined;
          const getRes = await fetch(url, { headers });
          if (getRes.ok) {
            const j = await getRes.json();
            sha = j.sha;
            addLog(`  Nadpisuję istniejący ${f.path}`, 'warn');
          }

          const putBody = { message: `AutoBuilder: ${f.path}`, content: content_b64 };
          if (sha) putBody.sha = sha;

          const putRes = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(putBody) });
          
          if (putRes.ok) {
            addLog(`OK: ${f.path}`, 'ok');
            successCount++;
            break;
          } else if (putRes.status === 401) {
            addLog(`401 Unauthorized przy ${f.path}`, 'error');
            break;
          } else if (putRes.status === 409) {
            addLog(`409 Konflikt przy ${f.path} - retry`, 'warn');
            retries--;
            await new Promise(r => setTimeout(r, 1000));
          } else {
            const errText = await putRes.text();
            addLog(`FAIL ${f.path}: ${putRes.status} ${errText.slice(0,200)}`, 'error');
            break;
          }
        } catch (e) {
          if (retries <= 0) {
            addLog(`EXC ${f.path}: ${e.message}`, 'error');
            break;
          }
          retries--;
        }
      }
    }

    addLog(`ZAKOŃCZONO: ${successCount}/${files.length} plików`, successCount===files.length ? 'ok' : 'warn');
    if (successCount > 0) addLog(`Sprawdź: https://github.com/${user}/${repo}`, 'ok');
    setLoading(false);
    
    // bezpieczeństwo: nie trzymaj tokenu w pamięci po sukcesie jeśli chcesz - opcjonalnie wyczyść
    // setToken(''); // odkomentuj jeśli chcesz auto-czyścić
  };

  return (
    <PaperProvider>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        <Text variant="headlineMedium" style={{ marginBottom: 4 }}>AutoBuilder Agent V5</Text>
        <Text style={{ marginBottom: 12, opacity:0.7 }}>Fixed: base64, validation, parser, GitHub API headers</Text>

        <Card style={{ marginBottom: 12 }}>
          <Card.Content>
            <Text variant="titleSmall" style={{marginBottom:8}}>Konfiguracja GitHub</Text>
            <TextInput label="GitHub Token (ghp_...)" value={token} onChangeText={setToken} secureTextEntry style={{ marginBottom: 8 }} autoCapitalize="none" />
            <TextInput label="GitHub Login (np. piotr123)" value={user} onChangeText={setUser} style={{ marginBottom: 8 }} autoCapitalize="none" />
            <TextInput label="Nazwa nowego repo" value={repo} onChangeText={setRepo} style={{ marginBottom: 8 }} autoCapitalize="none" />
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Card.Content>
            <Text variant="titleSmall" style={{marginBottom:8}}>WIELKI ZLEPEK OD AI</Text>
            <Text style={{fontSize:12, opacity:0.6, marginBottom:6}}>Format: --- FILE: sciezka/pliku ---</Text>
            <TextInput value={blob} onChangeText={setBlob} multiline numberOfLines={14} style={{ minHeight: 260, textAlignVertical: 'top', fontSize: 12 }} placeholder={"--- FILE: pom.xml ---\n<project>...</project>\n--- FILE: src/main/resources/plugin.yml ---\nname: FireTrail..."} />
          </Card.Content>
        </Card>

        <Button mode="contained" onPress={buildRepo} loading={loading} style={{ marginBottom: 16 }}>ZBUDUJ REPO AUTOMATYCZNIE</Button>

        <Card>
          <Card.Content>
            <Text variant="titleMedium">Log:</Text>
            {log.map((l, i) => <Text key={i} style={{ fontSize: 11, fontFamily: 'monospace', marginTop: 4 }}>{l}</Text>)}
            {log.length>0 && <Button style={{marginTop:12}} onPress={()=>setLog([])}>Wyczyść log</Button>}
          </Card.Content>
        </Card>
      </ScrollView>
      </KeyboardAvoidingView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#f5f5f5' } });

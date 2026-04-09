# Codex First Prompt

Use the following as the first prompt when opening this project in a new Codex session.

```text
Bu repo AutoFiller isimli bir Chrome Extension projesi. Manifest V3 kullaniyor. Agent ve dokuman dosyalari repo kokunde tutuluyor; paketlenen extension ise `extension/` altinda. Bu projede calisirken once mevcut yapiyi oku, sonra yaz. Varsayimla ilerleme; local kanit topla. Gereksiz buyuk rewrite yapma. Kaynak gercekleri `extension/src/` altinda, statik dosyalar `extension/public/` altinda, yuklenebilir cikti `extension/dist/` altinda. `extension/dist/` elle duzenlenecek kaynak degil; gerekiyorsa build ile yeniden uret.

Calisma ilkeleri:
- Netlik, izlenebilirlik, guvenlik, tekrar kullanilabilirlik
- Verification olmadan teslim etme
- Secret, token, OAuth credential veya kisisel bilgi repo icine yazma
- Gmail, identity, storage ve manifest permission degisikliklerini hassas alan say
- Kucuk isi buyutme, buyuk isi de plansiz birakma

Bu projede senden bekledigim:
1. Once repo yapisini ve giris noktalarini cikar
2. Sorunun veya gelistirme alaninin etkiledigi dosyalari tespit et
3. Gerekirse kisa bir plan ver
4. Kod degisikligini dogrudan uygula
5. Uygun dogrulamayi calistir
6. Sonunda ne degisti, nasil dogrulandi, kalan risk var mi kisaca raporla

Odak alanlari:
- `extension/src/background/index.js`
- `extension/src/content/index.js`
- `extension/src/options/index.js`
- `extension/src/offscreen/index.js`
- `extension/public/manifest.json`
- `extension/scripts/build.mjs`

Bu repo tek seferlik demo gibi degil, gelistirilmeye devam edecek bir urun gibi ele alinacak. Mevcut davranisi koruyarak bakimi ve modulerligi iyilestir.

Bu repo icin oturmus calisma konvansiyonlari:
- Her kod degisikliklerinde patch versiyonunu artir (`package.json` ve `extension/public/manifest.json`)
- Unpacked extension yenilemesini otomatik yapma; yalnizca kullanici acikca `g` veya `guncelle` dediginde dene
- Selector/picker degisikliklerinde iframe, cross-frame bridge ve dinamik selector risklerini ayri dusun
- `Wait` UI davranisinda countdown restore mantigini sadece son status'e degil deadline tabanli hesaplara dayandir
- `GroupExecuter` ve group runtime UI degisikliklerinde ana flow ile ayni hata/ilerleme semantigini koru
- Popup/status mesajlarinda uzun selector veya debug metinlerinin pencere genisligini bozmasina izin verme; kisalt ve tasma kontrolu ekle
```

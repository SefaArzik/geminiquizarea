# Live Stats Test Checklist

## 1. Baseline (2 students)
1. Teacher yeni oda olusturur ve testi baslatir.
2. Iki ogrenci ayni soruda farkli secenekleri secer.
3. Teacher panelindeki soru istatistikleri anlik guncellenmeli:
   - Dogru/Yanlis sayilari
   - Yuzde bari
   - Ogrenci isimleri
4. Top bar `Realtime Bagli` olmali.

## 2. Burst answers (5 students)
1. Ayni anda 5 ogrenci cevap gonderir.
2. Event sayaci artmali (`Event: N`).
3. Lag metrikleri (`Lag: Xms`) gorunmeli.
4. UI donmadan sirali sekilde guncellenmeli.

## 3. High concurrency (10 students)
1. 10 ogrenci ile 3 soru boyunca devam edin.
2. Her soruda istatistikler tutarli kalmali.
3. Manual `Sync` butonuna basinca sayilar degismemeli (drift olmamali).

## 4. Reconnect behavior
1. Teacher tarayicisinda agi kisa sure kapatip acin.
2. Top bar durumu sirasiyla degisebilir:
   - Baglaniliyor
   - Baglanti Sorunu (gecici)
   - Realtime Bagli
3. Yeniden baglanti sonrasi istatistikler snapshot ile toparlanmali.

## 5. Acceptance criteria
1. Siyah ekran yok.
2. Istatistik paneli gecikmesiz ilerliyor.
3. Cift sayim yok (duplicate event sonucu fazla artma yok).
4. Sync sonrasi sayilar stabil.


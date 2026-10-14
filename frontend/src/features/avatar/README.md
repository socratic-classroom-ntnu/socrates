# 人像開發測試

- 模型由同源 `/avatar-packs/` 提供；部署需保留唯讀資產掛載與各產品的模型許可篩選。
- 啟用 `debug_mode` 後展開「人像選擇（開發）」並點「重播既有錄音對話」；使用既有錄音，不呼叫 LLM、TTS、STT 或 SpeechSynthesis。
- 錄音為 `en-US-GuyNeural`、90 筆 visemes、31 筆 word timings；四份資產在解碼前驗 SHA256，音訊時鐘驅動嘴型。
- 點擊時同步解鎖音訊；停止、關閉語音或換模型會取消播放，晚到的解鎖不得重新啟動音訊。
- 個人教室與共思競技場使用新導師訊息；掛載前舊訊息不重播，新訊息等目前模型 ready 才發話。
- 共思舞台使用目前 focus 的導師訊息；正式文字發話仍可走無語音的嘴型 fallback，錄音重播則使用真實音訊。
- 驗證請執行 frontend typecheck、test、lint、build，並在實頁檢查音訊、嘴型與取消；播放結束不等於人類驗收。

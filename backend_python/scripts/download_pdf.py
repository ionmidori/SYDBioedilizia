import requests
import sys

url = "https://www.regione.lazio.it/sites/default/files/2023-04/Tariffa%20dei%20prezzi%202023.pdf"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}
print(f"Downloading from {url}...")
response = requests.get(url, headers=headers, stream=True)
if response.status_code == 200:
    with open("data/tariffa_lazio_2023.pdf", "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print("Download completed successfully.")
else:
    print(f"Failed to download: {response.status_code}")
    sys.exit(1)

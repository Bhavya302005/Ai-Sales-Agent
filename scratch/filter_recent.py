import json
import pandas as pd
import re

def main():
    with open("Twitter_Software_Dev_Interns.json", "r") as f:
        data = json.load(f)

    filtered_data = []
    for item in data:
        post_time = item.get("Posted Time", "")
        keep = False
        if "second" in post_time or "minute" in post_time or "hour" in post_time:
            keep = True
        elif "day" in post_time:
            match = re.search(r'(\d+)\s+days?', post_time)
            if match:
                days = int(match.group(1))
                if days <= 14:
                    keep = True
        
        if keep:
            filtered_data.append(item)

    print(f"✅ Filtered {len(data)} total posts down to {len(filtered_data)} recent posts (<= 14 days old).")

    with open("Twitter_Software_Dev_Interns.json", "w") as f:
        json.dump(filtered_data, f, indent=4)

    if filtered_data:
        df = pd.DataFrame(filtered_data)
        df.to_excel("Twitter_Software_Dev_Interns.xlsx", index=False)
    else:
        # If empty, just save empty dataframe
        pd.DataFrame([]).to_excel("Twitter_Software_Dev_Interns.xlsx", index=False)

if __name__ == "__main__":
    main()

import csv
import os
import argparse
import re
from datetime import datetime

# Define the expected base path for data files relative to the script's location
# Script is in 'scripts/', data is in 'public/assets/data/'
DEFAULT_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'data')

def find_latest_file_starting_with_prefix(directory, prefix, suffix):
    """
    Finds the most recent file in a directory that starts with a given prefix and ends with a suffix.
    Prefers files with YYYY-MM-DD in the name.
    Returns the full path to the file, or None if not found.
    """
    matching_files = []
    try:
        for fname in os.listdir(directory):
            if fname.startswith(prefix) and fname.endswith(suffix):
                match = re.search(r'(\d{4}-\d{2}-\d{2})', fname)
                if match:
                    try:
                        file_date = datetime.strptime(match.group(1), '%Y-%m-%d').date()
                        matching_files.append((file_date, fname))
                    except ValueError:
                        # Invalid date format in filename, treat as undated with lowest priority
                        matching_files.append((datetime.min.date(), fname))
                else:
                    # No date in filename, treat as undated with lowest priority
                    matching_files.append((datetime.min.date(), fname))
    except FileNotFoundError:
        print(f"Error: Directory not found: {directory}")
        return None


    if not matching_files:
        return None

    # Sort by date (newest first), then by name (alphabetically, as a tie-breaker)
    matching_files.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return os.path.join(directory, matching_files[0][1])


def load_scryfall_data(set_code, data_path):
    """Loads card data from the Scryfall export CSV."""
    filename = os.path.join(data_path, f"scryfall_export_{set_code.lower()}.csv")
    if not os.path.exists(filename):
        print(f"Error: Scryfall export file not found: {filename}")
        return None
    
    cards = {}
    try:
        with open(filename, 'r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                cards[row['Name']] = row
        print(f"Successfully loaded {len(cards)} cards from {filename}")
        return cards
    except Exception as e:
        print(f"Error reading Scryfall data from {filename}: {e}")
        return None

def load_17lands_data(set_code, data_path):
    """Loads card data from the 17Lands export CSV, handling complex headers and fallback naming."""
    filename = None
    
    # 1. Try dated prefix pattern (e.g., 17lands-TDM-card-ratings-YYYY-MM-DD.csv)
    dated_prefix = f"17lands-{set_code.upper()}-card-ratings"
    filename = find_latest_file_starting_with_prefix(data_path, dated_prefix, ".csv")

    # 2. If not found, try undated version of the same prefix (e.g., 17lands-TDM-card-ratings.csv)
    if not filename or not os.path.exists(filename):
        undated_prefixed_file = os.path.join(data_path, f"{dated_prefix}.csv")
        if os.path.exists(undated_prefixed_file):
            filename = undated_prefixed_file
            
    # 3. If not found, try the specific "export" pattern (e.g., 17Lands_export_tdm.csv)
    if not filename or not os.path.exists(filename):
        export_pattern_file = os.path.join(data_path, f"17Lands_export_{set_code.lower()}.csv")
        if os.path.exists(export_pattern_file):
            filename = export_pattern_file

    if not filename or not os.path.exists(filename):
        print(f"Warning: 17Lands data file for set '{set_code.upper()}' not found in {data_path} using common naming patterns.")
        return {}

    print(f"Attempting to load 17Lands data from: {filename}")
    cards = {}
    try:
        with open(filename, 'r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            name_column_key = None
            if reader.fieldnames:
                for field in reader.fieldnames:
                    if "Name" in field:
                        name_column_key = field
                        break
            if not name_column_key:
                print(f"Error: Could not determine the 'Name' column header in {filename}.")
                if reader.fieldnames: print(f"Available headers: {reader.fieldnames}")
                return {}

            for row in reader:
                try:
                    card_name_value = row[name_column_key].strip('"')
                    standardized_row_data = {}
                    for original_key, value in row.items():
                        if original_key == name_column_key:
                            standardized_key = 'Name'
                        else:
                            standardized_key = original_key.strip('"')
                        standardized_row_data[standardized_key] = value
                    cards[card_name_value] = {f"17L_{std_k}": val for std_k, val in standardized_row_data.items() if std_k != 'Name'}
                except KeyError:
                    print(f"Skipping malformed row in {filename} (missing key {name_column_key}): {row}")
                    continue
        print(f"Successfully loaded {len(cards)} cards from {filename}")
        return cards
    except Exception as e:
        print(f"Error reading 17Lands data from {filename}: {e}")
        return {}

def load_aetherhub_data(set_code, data_path):
    """Loads comments and ratings from the AetherHub export TXT file with fallback naming."""
    filename = None

    # 1. Try dated prefix pattern (e.g., aetherhub-comments-TDM-YYYY-MM-DD.txt)
    dated_prefix = f"aetherhub-comments-{set_code.upper()}"
    filename = find_latest_file_starting_with_prefix(data_path, dated_prefix, ".txt")

    # 2. If not found, try undated version of the same prefix (e.g., aetherhub-comments-TDM.txt)
    if not filename or not os.path.exists(filename):
        undated_prefixed_file = os.path.join(data_path, f"{dated_prefix}.txt")
        if os.path.exists(undated_prefixed_file):
            filename = undated_prefixed_file

    # 3. If not found, try the specific "export" pattern (e.g., aetherhub_export_tdm.txt)
    if not filename or not os.path.exists(filename):
        export_pattern_file = os.path.join(data_path, f"aetherhub_export_{set_code.lower()}.txt")
        if os.path.exists(export_pattern_file):
            filename = export_pattern_file
    
    if not filename or not os.path.exists(filename):
        print(f"Warning: AetherHub data file for set '{set_code.upper()}' not found in {data_path} using common naming patterns.")
        return {}

    print(f"Attempting to load AetherHub data from: {filename}")
    cards_comments = {}
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            current_card_name = None; current_comment_lines = []; ai_rating = None; pro_rating = None
            for line in f:
                stripped_line = line.strip()
                if not stripped_line:
                    if current_card_name:
                        cards_comments[current_card_name] = {
                            'AH_AI_Rating': ai_rating if ai_rating is not None else 'N/A',
                            'AH_Pro_Rating': pro_rating if pro_rating is not None else 'N/A',
                            'AH_Comment': " ".join(current_comment_lines).strip() or 'N/A'
                        }
                    current_card_name = None; current_comment_lines = []; ai_rating = None; pro_rating = None
                elif current_card_name is None:
                    current_card_name = stripped_line
                else:
                    ai_match = re.match(r"AI Rating:\s*(.*)", stripped_line, re.IGNORECASE)
                    pro_match = re.match(r"Pro Rating:\s*(.*)", stripped_line, re.IGNORECASE)
                    if ai_match: ai_rating = ai_match.group(1).strip()
                    elif pro_match: pro_rating = pro_match.group(1).strip()
                    else: current_comment_lines.append(stripped_line)
            if current_card_name:
                cards_comments[current_card_name] = {
                    'AH_AI_Rating': ai_rating if ai_rating is not None else 'N/A',
                    'AH_Pro_Rating': pro_rating if pro_rating is not None else 'N/A',
                    'AH_Comment': " ".join(current_comment_lines).strip() or 'N/A'
                }
        print(f"Successfully loaded comments for {len(cards_comments)} cards from {filename}")
        return cards_comments
    except Exception as e:
        print(f"Error reading AetherHub data from {filename}: {e}")
        return {}

def get_card_data_with_fallbacks(scryfall_name, data_source_dict):
    """
    Attempts to find card data in data_source_dict using the scryfall_name,
    falling back to parts of the name if it's a double-faced card.
    """
    data = data_source_dict.get(scryfall_name)
    if data: return data
    if " // " in scryfall_name:
        parts = scryfall_name.split(" // ", 1)
        name_part1 = parts[0].strip(); name_part2 = parts[1].strip()
        data = data_source_dict.get(name_part1)
        if data: return data
        data = data_source_dict.get(name_part2)
        if data: return data
    return None

def main():
    parser = argparse.ArgumentParser(description="Augment Scryfall card data with 17Lands and AetherHub info.")
    parser.add_argument("set_code", help="The MTG set code (e.g., tdm, woe).")
    parser.add_argument("--data_path", default=DEFAULT_DATA_PATH, help=f"Path to the data files directory. Defaults to: {DEFAULT_DATA_PATH}")
    
    args = parser.parse_args()
    set_code = args.set_code.strip()
    data_path = args.data_path

    print(f"Processing set: {set_code.upper()}")
    print(f"Using data path: {data_path}")

    scryfall_cards = load_scryfall_data(set_code, data_path)
    if scryfall_cards is None: return

    lands_data = load_17lands_data(set_code, data_path)
    aetherhub_comments = load_aetherhub_data(set_code, data_path)

    augmented_data = []; all_fieldnames_set = set()
    if scryfall_cards:
        sample_scryfall_card = next(iter(scryfall_cards.values()), None)
        if sample_scryfall_card: all_fieldnames_set.update(sample_scryfall_card.keys())
    if lands_data:
        sample_lands_card = next(iter(lands_data.values()), None)
        if sample_lands_card: all_fieldnames_set.update(sample_lands_card.keys())
    all_fieldnames_set.update(['AH_AI_Rating', 'AH_Pro_Rating', 'AH_Comment'])

    print("\nAugmenting data...")
    cards_not_in_17lands = []; cards_not_in_aetherhub = []

    for card_name_scryfall, scryfall_info in scryfall_cards.items():
        combined_info = scryfall_info.copy()
        card_lands_data = get_card_data_with_fallbacks(card_name_scryfall, lands_data)
        if card_lands_data: combined_info.update(card_lands_data)
        else:
            cards_not_in_17lands.append(card_name_scryfall)
            if lands_data: # Add N/A for 17L fields if 17L data was loaded but card not found
                sample_17l_keys = next(iter(lands_data.values()), {}).keys()
                for k_17l in sample_17l_keys:
                     if k_17l not in combined_info: combined_info[k_17l] = 'N/A'
        
        card_aetherhub_data = get_card_data_with_fallbacks(card_name_scryfall, aetherhub_comments)
        if card_aetherhub_data: combined_info.update(card_aetherhub_data)
        else:
            cards_not_in_aetherhub.append(card_name_scryfall)
            combined_info['AH_AI_Rating'] = 'N/A'; combined_info['AH_Pro_Rating'] = 'N/A'; combined_info['AH_Comment'] = 'N/A'
        augmented_data.append(combined_info)

    if cards_not_in_17lands:
        print(f"\n--- {len(cards_not_in_17lands)} Cards Not Found in 17Lands Data ({set_code.upper()}) ---")
        for name_miss_17l in cards_not_in_17lands: print(name_miss_17l)
    if cards_not_in_aetherhub:
        print(f"\n--- {len(cards_not_in_aetherhub)} Cards Not Found in AetherHub Data ({set_code.upper()}) ---")
        for name_miss_ah in cards_not_in_aetherhub: print(name_miss_ah)

    output_filename = os.path.join(data_path, "tdm_data.csv")
    if not augmented_data:
        print("\nNo data to write to CSV."); return

    ordered_fieldnames = []
    scryfall_keys_list = list(next(iter(scryfall_cards.values()), {}).keys()) # Ensure scryfall_cards is not empty
    ordered_fieldnames.extend(scryfall_keys_list)
    aetherhub_keys_list = ['AH_AI_Rating', 'AH_Pro_Rating', 'AH_Comment']
    for ah_key_item in aetherhub_keys_list:
        if ah_key_item not in ordered_fieldnames: ordered_fieldnames.append(ah_key_item)
    lands_keys_list = list(next(iter(lands_data.values()), {}).keys()) # Ensure lands_data is not empty
    for l_key_item in lands_keys_list:
        if l_key_item not in ordered_fieldnames: ordered_fieldnames.append(l_key_item)
    remaining_fieldnames = sorted(list(all_fieldnames_set - set(ordered_fieldnames)))
    ordered_fieldnames.extend(remaining_fieldnames)

    try:
        with open(output_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=ordered_fieldnames, extrasaction='ignore', restval='N/A')
            writer.writeheader(); writer.writerows(augmented_data)
        print(f"\nSuccessfully saved augmented data to: {output_filename}")
    except Exception as e:
        print(f"Error writing augmented data to {output_filename}: {e}")

if __name__ == "__main__":
    main()
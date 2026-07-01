param(
  [string]$WorkbookPath = "C:\Users\anish.baniya\Downloads\World-Cup Master V2_1.1.xlsx",
  [string]$OutputPath = "src\lib\matchday-data.ts"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Convert-ColumnToNumber([string]$Column) {
  $number = 0
  foreach ($char in $Column.ToCharArray()) {
    $number = ($number * 26) + ([int][char]$char - [int][char]'A' + 1)
  }
  return $number
}

function Read-ZipText($Zip, [string]$EntryName) {
  $entry = $Zip.GetEntry($EntryName)
  if (-not $entry) {
    throw "Workbook entry not found: $EntryName"
  }

  $reader = [System.IO.StreamReader]::new($entry.Open())
  try {
    return $reader.ReadToEnd()
  }
  finally {
    $reader.Dispose()
  }
}

function Read-SharedStrings($Zip) {
  $entry = $Zip.GetEntry("xl/sharedStrings.xml")
  if (-not $entry) {
    return @()
  }

  [xml]$xml = Read-ZipText $Zip "xl/sharedStrings.xml"
  $strings = @()
  foreach ($item in $xml.sst.si) {
    $text = ""
    if ($item.t) {
      $text = $item.t.'#text'
      if ($null -eq $text) {
        $text = [string]$item.t
      }
    }
    else {
      foreach ($run in $item.r) {
        $text += [string]$run.t
      }
    }
    $strings += $text
  }
  return $strings
}

function Get-SheetTargets($Zip) {
  [xml]$workbook = Read-ZipText $Zip "xl/workbook.xml"
  [xml]$rels = Read-ZipText $Zip "xl/_rels/workbook.xml.rels"

  $relTargets = @{}
  foreach ($rel in $rels.Relationships.Relationship) {
    $relTargets[$rel.Id] = $rel.Target
  }

  $targets = @{}
  foreach ($sheet in $workbook.workbook.sheets.sheet) {
    $relationshipId = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $targets[[string]$sheet.name] = "xl/" + $relTargets[$relationshipId]
  }

  return $targets
}

function Read-SheetCells($Zip, [string]$EntryName, [object[]]$SharedStrings) {
  [xml]$xml = Read-ZipText $Zip $EntryName
  $cells = @{}

  foreach ($cell in $xml.worksheet.sheetData.row.c) {
    if ($cell.r -notmatch '^([A-Z]+)(\d+)$') {
      continue
    }

    $column = Convert-ColumnToNumber $matches[1]
    $row = [int]$matches[2]
    $value = [string]$cell.v

    if ($cell.t -eq "s" -and $value -ne "") {
      $value = $SharedStrings[[int]$value]
    }
    elseif ($cell.t -eq "inlineStr") {
      $value = [string]$cell.is.t
    }

    $cells["$row,$column"] = $value
  }

  return $cells
}

function Get-Cell($Cells, [int]$Row, [int]$Column) {
  $key = "$Row,$Column"
  if ($Cells.ContainsKey($key)) {
    return $Cells[$key]
  }
  return $null
}

function Convert-ToNullableInt($Value) {
  if ($null -eq $Value -or [string]$Value -eq "") {
    return $null
  }

  $number = 0.0
  if ([double]::TryParse([string]$Value, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return [int][math]::Round($number)
  }

  return $null
}

function Convert-ExcelSerialDate([double]$Serial) {
  return ([datetime]"1899-12-30").AddDays($Serial)
}

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "Workbook not found: $WorkbookPath"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $WorkbookPath))

try {
  $sharedStrings = Read-SharedStrings $zip
  $sheetTargets = Get-SheetTargets $zip
  $matchesCells = Read-SheetCells $zip $sheetTargets["Matches"] $sharedStrings
  $predictionsCells = Read-SheetCells $zip $sheetTargets["Predictions"] $sharedStrings

  $matches = @()
  $matchByTeams = @{}

  for ($row = 4; $row -le 140; $row++) {
    $matchNo = Convert-ToNullableInt (Get-Cell $matchesCells $row 2)
    $dateSerial = Get-Cell $matchesCells $row 6
    $venue = Get-Cell $matchesCells $row 8
    $team1 = Get-Cell $matchesCells $row 9
    $team2 = Get-Cell $matchesCells $row 10
    if (-not $team1) {
      $team1 = Get-Cell $matchesCells $row 3
    }
    if (-not $team2) {
      $team2 = Get-Cell $matchesCells $row 4
    }

    if ($null -eq $matchNo -or -not $team1 -or -not $team2) {
      continue
    }

    $dateValue = Convert-ExcelSerialDate ([double]::Parse([string]$dateSerial, [Globalization.CultureInfo]::InvariantCulture))
    $match = [ordered]@{
      matchNo = $matchNo
      date = $dateValue.ToString("yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
      time = $dateValue.ToString("HH:mm", [Globalization.CultureInfo]::InvariantCulture)
      team1 = [string]$team1
      team2 = [string]$team2
      venue = [string]$venue
    }

    $matches += $match
    $matchByTeams["$team1|||$team2"] = $matchNo
  }

  $participantBlocks = @()
  for ($column = 9; $column -le 1600; $column++) {
    $name = Get-Cell $predictionsCells 3 $column
    if ($name) {
      $participantBlocks += [ordered]@{
        column = $column
        name = [string]$name
      }
    }
  }

  $rowToMatchNo = @{}

  for ($row = 6; $row -le 88; $row++) {
    $team1 = Get-Cell $predictionsCells $row 3
    $team2 = Get-Cell $predictionsCells $row 5
    if (-not $team1 -or -not $team2) {
      continue
    }

    $key = "$team1|||$team2"
    if ($matchByTeams.ContainsKey($key)) {
      $rowToMatchNo[$row] = $matchByTeams[$key]
    }
  }

  $knockoutRows = @()
  for ($row = 90; $row -le 126; $row++) {
    $team1 = Get-Cell $predictionsCells $row 10
    $team2 = Get-Cell $predictionsCells $row 12
    $goals1 = Convert-ToNullableInt (Get-Cell $predictionsCells $row 13)
    $goals2 = Convert-ToNullableInt (Get-Cell $predictionsCells $row 14)

    if ($team1 -and $team2 -and ($null -ne $goals1 -or $null -ne $goals2)) {
      $knockoutRows += $row
    }
  }

  for ($index = 0; $index -lt $knockoutRows.Count -and $index -lt 32; $index++) {
    $rowToMatchNo[$knockoutRows[$index]] = 73 + $index
  }

  $predictionsByMatch = [ordered]@{}
  foreach ($row in ($rowToMatchNo.Keys | Sort-Object { [int]$_ })) {
    $matchNo = $rowToMatchNo[$row]
    $predictions = @()

    foreach ($block in $participantBlocks) {
      $column = [int]$block.column
      $team1 = Get-Cell $predictionsCells $row ($column + 1)
      $team2 = Get-Cell $predictionsCells $row ($column + 3)

      if (-not $team1 -or -not $team2) {
        continue
      }

      $predictions += [ordered]@{
        name = $block.name
        team1 = [string]$team1
        team2 = [string]$team2
        goals1 = Convert-ToNullableInt (Get-Cell $predictionsCells $row ($column + 4))
        goals2 = Convert-ToNullableInt (Get-Cell $predictionsCells $row ($column + 5))
      }
    }

    $predictionsByMatch[[string]$matchNo] = $predictions
  }

  $data = [ordered]@{
    matches = @($matches | Sort-Object matchNo)
    predictionsByMatch = $predictionsByMatch
  }

  $json = $data | ConvertTo-Json -Depth 100
  $content = "import type { MatchdayData } from `"./types`";`r`n`r`nexport const matchdayData = $json satisfies MatchdayData;`r`n"

  $resolvedOutputPath = Join-Path (Get-Location) $OutputPath
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutputPath)) | Out-Null
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($resolvedOutputPath, $content, $utf8NoBom)

  Write-Output "Imported $($participantBlocks.Count) participants, $($matches.Count) matches, and $($predictionsByMatch.Keys.Count) prediction slots."
}
finally {
  $zip.Dispose()
}

package main

import "testing"

func TestValidateMovement(t *testing.T) {
	cost := int64(4500)
	validEntry := movementInput{RequestKey: "00000000-0000-4000-8000-000000000001", BranchID: 1, VariantID: 2, Kind: "purchase", Delta: 5, UnitCostMinor: &cost}
	if err := validateMovement(validEntry); err != nil {
		t.Fatalf("valid entry rejected: %v", err)
	}
	validEntry.Delta = -5
	if err := validateMovement(validEntry); err == nil {
		t.Fatal("negative purchase accepted")
	}
	validAdjustment := movementInput{RequestKey: "00000000-0000-4000-8000-000000000002", BranchID: 1, VariantID: 2, Kind: "adjustment", Delta: -1, Note: "Recuento físico"}
	if err := validateMovement(validAdjustment); err != nil {
		t.Fatalf("valid adjustment rejected: %v", err)
	}
	validAdjustment.Note = ""
	if err := validateMovement(validAdjustment); err == nil {
		t.Fatal("adjustment without a reason accepted")
	}
}

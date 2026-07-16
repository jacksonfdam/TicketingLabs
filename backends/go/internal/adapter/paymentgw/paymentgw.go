// Package paymentgw is the HTTP client for the (fake) external payment provider. It
// has a hard timeout so a hanging provider cannot hang our worker. Retry with backoff
// lives in the worker; the circuit breaker wraps it (see breaker.go).
package paymentgw

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL string
	http    *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		// A timeout is not optional. "The provider is slow today" must not become
		// "our workers are all blocked forever."
		http: &http.Client{Timeout: 4 * time.Second},
	}
}

type chargeResponse struct {
	ProviderRef string `json:"provider_ref"`
	Status      string `json:"status"`
}

func (c *Client) Charge(ctx context.Context, orderID string) (string, error) {
	body, _ := json.Marshal(map[string]string{"order_id": orderID})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/charges", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("payment gateway returned %d", resp.StatusCode)
	}
	var out chargeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.ProviderRef, nil
}
